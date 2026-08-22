import { isHash, type Hash } from "viem";
import {
  REGISTRATION_USD,
  activeChainId,
  mainnetPaymentsEnabled,
  paymentRecipient,
  publicNetwork,
  usdtContract,
} from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { parsePaymentType } from "@/payments/payment-type";
import { PlanRoutingError, resolvePlanRecipient, resolveReentryPayment } from "@/payments/plan-routing";
import {
  activateReservedReentry,
  assertRegistrationDidNotCreateGlobal,
  cycleComplete,
  currentPosition,
  finalizeConfirmedDirect2Placement,
  positionsForPlan,
  voidUnpaidDirect2Provision,
} from "@/services/users";
import { findPendingIntent, intentPayee, PlacementError } from "@/services/placement-intent";
import {
  hasConfirmedPlan,
  isPlanUnlocked,
  orderedPlans,
  planViewState,
  sponsorDirects,
} from "@/lib/plan-progress";
import { ChainVerifyError, verifyTokenTransfer } from "@/payments/verify";
import { publicClient } from "@/lib/viem";
import type { RegistrationRow, TransactionRow } from "@/types";

function isRetryableRpcError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /authenticated|Must be authenticated|HTTP request failed|timeout|429|503|fetch failed|rate limit|RPC/i.test(
    msg,
  );
}

export function amountToUnits(usd: number, decimals = 6) {
  return BigInt(usd) * BigInt(10) ** BigInt(decimals);
}

async function activateReservedIfDirect2Funded(positionId: string, txHash: Hash) {
  const store = await readStore();
  const pos = store.network_positions.find((p) => p.id === positionId);
  if (!pos || pos.status !== "RESERVED") return;
  await activateReservedReentry(pos.user_id, txHash, pos.plan_id);
}

export async function getRegistration(userId: string): Promise<RegistrationRow | null> {
  return (await readStore()).registrations.find((r) => r.user_id === userId) ?? null;
}

async function ensureRegistrationRow(userId: string): Promise<RegistrationRow> {
  return withStore((store) => {
    let row = store.registrations.find((r) => r.user_id === userId);
    if (!row) {
      row = {
        id: newId("reg"),
        user_id: userId,
        status: "NOT_PAID",
        amount: amountToUnits(REGISTRATION_USD).toString(),
        tx_hash: null,
        created_at: new Date().toISOString(),
        activated_at: null,
      };
      store.registrations.push(row);
    }
    return row;
  });
}

export async function preparePayment(userId: string, paymentType: string, opts?: { forConfirm?: boolean; planId?: string }) {
  if (publicNetwork() === "mainnet" && !mainnetPaymentsEnabled()) {
    throw new Error("Mainnet payments are disabled. Keep NEXT_PUBLIC_NETWORK=amoy.");
  }
  const token = usdtContract();
  if (!token) throw new Error("USDT testnet contract is not configured.");

  if (paymentType === "REGISTRATION") {
    const company = paymentRecipient();
    if (!company) throw new Error("PAYMENT_RECIPIENT_ADDRESS is not set.");
    const reg = await ensureRegistrationRow(userId);
    if (reg.status === "ACTIVE" && !opts?.forConfirm) throw new Error("Registration is already ACTIVE.");
    return {
      paymentType: "REGISTRATION" as const,
      chainId: activeChainId(),
      tokenContract: token,
      recipient: company,
      amountUsd: REGISTRATION_USD,
      amountUnits: amountToUnits(REGISTRATION_USD).toString(),
      decimals: 6,
      symbol: "USDT",
      recipientRole: "COMPANY_GENESIS" as const,
      slot: null as 1 | 2 | null,
      directNumber: null as 1 | 2 | null,
      globalParentUserId: null as string | null,
      positionId: null as string | null,
      intentId: null as string | null,
      notice:
        "TESTNET. $5 registration always goes to the company address. Connect Wallet never creates this transfer. Registration never creates a Global position.",
    };
  }

  const parsedType = parsePaymentType(paymentType);
  if (parsedType.kind === "GLOBAL_REENTRY") {
    const registration = await getRegistration(userId);
    if (registration?.status !== "ACTIVE") {
      throw new Error("Complete $5 registration first. Plans unlock only after registration is ACTIVE.");
    }
    const planId = opts?.planId ?? parsedType.planId;
    if (opts?.forConfirm && planId) {
      const stored = findPendingIntent(await readStore(), "GLOBAL_REENTRY", userId, planId);
      if (stored) {
        const plan = (await readStore()).plans.find((p) => p.id === stored.plan_id);
        return {
          paymentType: "GLOBAL_REENTRY" as const,
          planId: stored.plan_id,
          planCode: plan?.code ?? stored.plan_id,
          chainId: activeChainId(),
          tokenContract: token,
          recipient: intentPayee(stored),
          amountUsd: stored.amount_usd,
          amountUnits: amountToUnits(stored.amount_usd).toString(),
          decimals: 6,
          symbol: "USDT",
          recipientRole: "GLOBAL_REENTRY" as const,
          slot: null as 1 | 2 | null,
          directNumber: null as 1 | 2 | null,
          globalParentUserId: stored.candidate_recipient_user_id,
          positionId: null as string | null,
          intentId: stored.id,
          notice: "Quoted re-entry route (not refreshed).",
        };
      }
    }
    const routed = await resolveReentryPayment(userId, planId);
    return {
      paymentType: "GLOBAL_REENTRY" as const,
      planId: routed.planId,
      planCode: routed.planCode,
      chainId: activeChainId(),
      tokenContract: token,
      recipient: routed.recipient,
      amountUsd: routed.amountUsd,
      amountUnits: amountToUnits(routed.amountUsd).toString(),
      decimals: 6,
      symbol: "USDT",
      recipientRole: routed.recipientRole,
      slot: routed.slot,
      directNumber: routed.directNumber,
      globalParentUserId: routed.globalParentUserId,
      positionId: routed.positionId ?? null,
      intentId: routed.intentId ?? null,
      notice: routed.notice,
    };
  }

  const registration = await getRegistration(userId);
  if (registration?.status !== "ACTIVE") {
    throw new Error("Complete $5 registration first. Plans unlock only after registration is ACTIVE.");
  }

  const db = await readStore();
  const plan = db.plans.find((p) => (p.code === paymentType || p.id === paymentType) && (p.active || p.enabled));
  if (!plan) throw new Error("UNKNOWN_PLAN");
  const already = db.transactions.find(
    (t) => t.user_id === userId && t.plan_id === plan.id && t.status === "CONFIRMED",
  );
  if (already && !opts?.forConfirm) throw new Error("PLAN_ALREADY_ACTIVE");

  if (opts?.forConfirm) {
    const stored = findPendingIntent(db, "DIRECT2_PLACEMENT", userId, plan.id);
    if (stored) {
      return {
        paymentType: "PLAN_PURCHASE" as const,
        planId: plan.id,
        planCode: plan.code,
        chainId: activeChainId(),
        tokenContract: token,
        recipient: intentPayee(stored),
        amountUsd: plan.amount_usd,
        amountUnits: amountToUnits(plan.amount_usd).toString(),
        decimals: 6,
        symbol: "USDT",
        recipientRole: "GLOBAL_UPLINE" as const,
        slot: 2 as const,
        directNumber: 2 as const,
        globalParentUserId: stored.movement_recipient_user_id ?? stored.candidate_recipient_user_id,
        positionId: null as string | null,
        intentId: stored.id,
        notice: "Quoted Direct #2 route (not refreshed).",
      };
    }
  }

  const routed = await resolvePlanRecipient(userId, plan.id);
  return {
    paymentType: "PLAN_PURCHASE" as const,
    planId: plan.id,
    planCode: plan.code,
    chainId: activeChainId(),
    tokenContract: token,
    recipient: routed.recipient,
    amountUsd: plan.amount_usd,
    amountUnits: amountToUnits(plan.amount_usd).toString(),
    decimals: 6,
    symbol: "USDT",
    recipientRole: routed.recipientRole,
    slot: routed.slot,
    directNumber: routed.directNumber,
    globalParentUserId: routed.globalParentUserId,
    positionId: routed.positionId ?? null,
    intentId: routed.intentId ?? null,
    notice: routed.notice,
  };
}

/** @deprecated use preparePayment */
export function preparePlanPayment(userId: string, planCode: string) {
  return preparePayment(userId, planCode);
}

export async function confirmPayment(input: {
  userId: string;
  payerWallet: string;
  paymentType: string;
  txHash: Hash;
  planId?: string;
}) {
  const existingEarly = (await readStore()).transactions.find((t) => t.tx_hash === input.txHash);
  if (existingEarly?.status === "CONFIRMED") {
    if (existingEarly.user_id !== input.userId) throw new Error("TX_ALREADY_USED");
    if (existingEarly.payment_type === "GLOBAL_REENTRY") {
      await activateReservedReentry(input.userId, input.txHash, existingEarly.plan_id ?? input.planId);
    }
    if (existingEarly.payment_type === "PLAN_PURCHASE" && existingEarly.direct_number === 2) {
      await finalizeConfirmedDirect2Placement(
        input.userId,
        existingEarly.plan_id ?? input.planId ?? "",
        input.txHash,
      );
    } else if (existingEarly.payment_type === "PLAN_PURCHASE" && existingEarly.position_id) {
      await activateReservedIfDirect2Funded(existingEarly.position_id, input.txHash);
    }
    let registration = await getRegistration(input.userId);
    if (existingEarly.payment_type === "REGISTRATION" && registration && registration.status !== "ACTIVE") {
      const idsBefore = new Set((await readStore()).network_positions.filter((p) => p.user_id === input.userId).map((p) => p.id));
      registration = await withStore((store) => {
        const reg = store.registrations.find((r) => r.user_id === input.userId)!;
        reg.status = "ACTIVE";
        reg.tx_hash = input.txHash;
        reg.activated_at = reg.activated_at ?? new Date().toISOString();
        assertRegistrationDidNotCreateGlobal(store, input.userId, idsBefore);
        return reg;
      });
    }
    return { transaction: existingEarly, registration };
  }

  const parsedConfirm = parsePaymentType(input.paymentType);
  const prepared = await preparePayment(input.userId, input.paymentType, {
    forConfirm: true,
    planId: input.planId ?? parsedConfirm.planId,
  });
  const already = await getRegistration(input.userId);
  if (prepared.paymentType === "REGISTRATION" && already?.status === "ACTIVE") {
    const existingTx = (await readStore()).transactions.find((t) => t.tx_hash === input.txHash);
    return { transaction: existingTx, registration: already };
  }
  const existing = (await readStore()).transactions.find((t) => t.tx_hash === input.txHash);
  if (existing && existing.user_id !== input.userId) throw new Error("TX_ALREADY_USED");

  const draftId = existing?.id ?? newId("tx");
  if (!existing) {
    await withStore((store) => {
      store.transactions.push({
        id: draftId,
        user_id: input.userId,
        payer_wallet: input.payerWallet.toLowerCase(),
        recipient_wallet: prepared.recipient.toLowerCase(),
        amount: prepared.amountUnits,
        token: "USDT",
        token_contract: prepared.tokenContract,
        chain_id: prepared.chainId,
        tx_hash: input.txHash,
        payment_type: prepared.paymentType,
        plan_id: "planId" in prepared ? (prepared.planId ?? null) : null,
        plan_code: prepared.paymentType === "REGISTRATION" ? "REGISTRATION" : (prepared.planCode ?? ""),
        status: "PENDING",
        recipient_role: prepared.recipientRole,
        routing_slot: prepared.slot,
        direct_number: "directNumber" in prepared ? prepared.directNumber : null,
        global_parent_user_id: "globalParentUserId" in prepared ? prepared.globalParentUserId : null,
        position_id: "positionId" in prepared ? prepared.positionId : null,
        intent_id: "intentId" in prepared ? prepared.intentId ?? null : null,
        created_at: new Date().toISOString(),
      });
    });
  }

  if (prepared.paymentType === "REGISTRATION") {
    await withStore((store) => {
      const reg = store.registrations.find((r) => r.user_id === input.userId);
      if (reg && reg.status !== "ACTIVE") {
        reg.status = "PENDING";
        reg.tx_hash = input.txHash;
      }
    });
  }

  try {
    let verified;
    try {
      verified = await verifyTokenTransfer({
        txHash: input.txHash,
        expectedPayer: input.payerWallet,
        expectedAmount: BigInt(prepared.amountUnits),
        expectedRecipient: prepared.recipient,
      });
    } catch (error) {
      const ownedHash =
        prepared.paymentType === "REGISTRATION" &&
        (await getRegistration(input.userId))?.tx_hash?.toLowerCase() === input.txHash.toLowerCase();
      if (!(error instanceof ChainVerifyError) || error.code !== "WRONG_SENDER" || !ownedHash) throw error;
      const chainTx = await publicClient().getTransaction({ hash: input.txHash });
      verified = await verifyTokenTransfer({
        txHash: input.txHash,
        expectedPayer: chainTx.from,
        expectedAmount: BigInt(prepared.amountUnits),
        expectedRecipient: prepared.recipient,
      });
    }
    const transaction = await withStore((store) => {
      const row = store.transactions.find((t) => t.id === draftId)!;
      row.status = "CONFIRMED";
      row.payer_wallet = verified.payerWallet.toLowerCase();
      row.recipient_wallet = verified.recipientWallet.toLowerCase();
      row.token_contract = verified.tokenContract.toLowerCase();
      return row;
    });

    let registration = await getRegistration(input.userId);
    if (prepared.paymentType === "REGISTRATION") {
      registration = await withStore((store) => {
        const idsBefore = new Set(store.network_positions.filter((p) => p.user_id === input.userId).map((p) => p.id));
        const reg = store.registrations.find((r) => r.user_id === input.userId)!;
        reg.status = "ACTIVE";
        reg.tx_hash = input.txHash;
        reg.activated_at = new Date().toISOString();
        assertRegistrationDidNotCreateGlobal(store, input.userId, idsBefore);
        return reg;
      });
    }
    if (prepared.paymentType === "GLOBAL_REENTRY") {
      await activateReservedReentry(input.userId, input.txHash, "planId" in prepared ? prepared.planId : undefined);
    }
    if (prepared.paymentType === "PLAN_PURCHASE" && prepared.directNumber === 2) {
      await finalizeConfirmedDirect2Placement(input.userId, prepared.planId, input.txHash);
    } else if (prepared.paymentType === "PLAN_PURCHASE" && "positionId" in prepared && prepared.positionId) {
      await activateReservedIfDirect2Funded(prepared.positionId, input.txHash);
    }
    return { transaction, registration, placement: { ok: true as const } };
  } catch (error) {
    if (error instanceof PlacementError && (error.code === "STALE_ROUTE" || error.code === "RECIPIENT_CHANGED")) {
      const transaction = await withStore((store) => {
        const row = store.transactions.find((t) => t.id === draftId)!;
        row.placement_status = error.code;
        return row;
      });
      return {
        transaction,
        registration: await getRegistration(input.userId),
        placement: { ok: false as const, code: error.code, message: error.message },
      };
    }
    const pending =
      (error instanceof ChainVerifyError && error.code === "PENDING") || isRetryableRpcError(error);
    await withStore((store) => {
      const row = store.transactions.find((t) => t.id === draftId);
      if (row) {
        row.status = pending ? "PENDING" : "FAILED";
        row.failure_reason = error instanceof ChainVerifyError ? error.code : "VERIFY_FAILED";
      }
      if (prepared.paymentType === "REGISTRATION") {
        const reg = store.registrations.find((r) => r.user_id === input.userId);
        if (reg && reg.status !== "ACTIVE") {
          reg.status = pending ? "PENDING" : "FAILED";
          reg.tx_hash = input.txHash;
        }
      }
    });
    if (
      !pending &&
      prepared.paymentType === "PLAN_PURCHASE" &&
      "directNumber" in prepared &&
      prepared.directNumber === 2 &&
      "planId" in prepared
    ) {
      await voidUnpaidDirect2Provision(input.userId, prepared.planId);
    }
    throw error;
  }
}

export async function confirmPlanPayment(input: {
  userId: string;
  payerWallet: string;
  planCode: string;
  txHash: Hash;
}) {
  return confirmPayment({ ...input, paymentType: input.planCode });
}

export async function retryPendingRegistration(userId: string) {
  const store = await readStore();
  const reg = store.registrations.find((r) => r.user_id === userId);
  if (!reg || reg.status === "ACTIVE") return { registration: reg ?? null };
  if (!reg.tx_hash || !isHash(reg.tx_hash)) return { registration: reg };
  const chainTx = await publicClient().getTransaction({ hash: reg.tx_hash });
  const payer = chainTx.from;
  return confirmPayment({
    userId,
    payerWallet: payer,
    paymentType: "REGISTRATION",
    txHash: reg.tx_hash,
  });
}

export async function listUserPlans(userId: string) {
  const store = await readStore();
  const directs = sponsorDirects(store.referrals, userId);
  return orderedPlans(store.plans).map((plan) => {
    const tx = store.transactions.find(
      (t) => t.user_id === userId && t.plan_id === plan.id && t.status === "CONFIRMED",
    );
    const membership = Boolean(tx);
    const unlocked = isPlanUnlocked(store.plans, store.transactions, userId, plan.id);
    const pos = currentPosition(store.network_positions, userId, plan.id);
    const missing = directs.filter((d) => !hasConfirmedPlan(store.transactions, d.user_id, plan.id));
    const waiting = membership && !pos;
    const cycleDone = Boolean(pos && cycleComplete(positionsForPlan(store.network_positions, plan.id), pos.id));
    const fundedByDirect2 = Boolean(
      (store.payment_intents ?? []).some(
        (i) => i.status === "CONFIRMED" && i.plan_id === plan.id && i.movement_from_position_id === pos?.id,
      ),
    );
    const pendingReentry = Boolean(
      (store.payment_intents ?? []).some(
        (i) => i.status === "PENDING" && i.kind === "GLOBAL_REENTRY" && i.plan_id === plan.id && i.mover_user_id === userId,
      ),
    );
    const reentryRequired = fundedByDirect2 ? false : cycleDone || pendingReentry;
    const global_status = planViewState({
      unlocked,
      membership,
      globalActive: Boolean(pos),
      reentryRequired,
      waitingForDirects: waiting,
    });
    return {
      ...plan,
      status: membership ? "ACTIVE" : unlocked ? "AVAILABLE" : "LOCKED",
      global_status,
      tx_hash: tx?.tx_hash ?? null,
      waiting_directs: waiting ? missing.length : 0,
      waiting_of: directs.length,
    };
  });
}

export type { TransactionRow };
