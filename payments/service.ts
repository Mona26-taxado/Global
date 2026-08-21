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
import { activateReservedReentry, cycleComplete, currentPosition, reservedPosition } from "@/services/users";
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
      notice:
        "TESTNET. $5 registration always goes to the company address. Connect Wallet never creates this transfer.",
    };
  }

  const parsedType = parsePaymentType(paymentType);
  if (parsedType.kind === "GLOBAL_REENTRY") {
    const registration = await getRegistration(userId);
    if (registration?.status !== "ACTIVE") {
      throw new Error("Complete $5 registration first. Plans unlock only after registration is ACTIVE.");
    }
    const planId = opts?.planId ?? parsedType.planId;
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
    let registration = await getRegistration(input.userId);
    if (existingEarly.payment_type === "REGISTRATION" && registration && registration.status !== "ACTIVE") {
      registration = await withStore((store) => {
        const reg = store.registrations.find((r) => r.user_id === input.userId)!;
        reg.status = "ACTIVE";
        reg.tx_hash = input.txHash;
        reg.activated_at = reg.activated_at ?? new Date().toISOString();
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
        const reg = store.registrations.find((r) => r.user_id === input.userId)!;
        reg.status = "ACTIVE";
        reg.tx_hash = input.txHash;
        reg.activated_at = new Date().toISOString();
        return reg;
      });
    }
    if (prepared.paymentType === "GLOBAL_REENTRY") {
      await activateReservedReentry(input.userId, input.txHash, "planId" in prepared ? prepared.planId : undefined);
    }
    return { transaction, registration };
  } catch (error) {
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
    const reserved = reservedPosition(store.network_positions, userId, plan.id);
    const missing = directs.filter((d) => !hasConfirmedPlan(store.transactions, d.user_id, plan.id));
    const waiting = membership && !pos;
    const reentryRequired = Boolean(reserved) || Boolean(pos && cycleComplete(store.network_positions, pos.id));
    const global_status = planViewState({
      unlocked,
      membership,
      globalActive: Boolean(pos),
      reentryRequired: reentryRequired && Boolean(reserved || (pos && cycleComplete(store.network_positions, pos.id))),
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
