import type { Hash } from "viem";
import {
  REGISTRATION_USD,
  activeChainId,
  mainnetPaymentsEnabled,
  paymentRecipient,
  publicNetwork,
  usdtContract,
} from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { PlanRoutingError, resolvePlanRecipient } from "@/payments/plan-routing";
import { ChainVerifyError, verifyTokenTransfer } from "@/payments/verify";
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

export async function preparePayment(userId: string, paymentType: string, opts?: { forConfirm?: boolean }) {
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
      notice:
        "TESTNET. $5 registration always goes to the company address. Connect Wallet never creates this transfer.",
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
}) {
  const prepared = await preparePayment(input.userId, input.paymentType, { forConfirm: true });
  const existing = (await readStore()).transactions.find((t) => t.tx_hash === input.txHash);
  if (existing?.status === "CONFIRMED") return { transaction: existing, registration: await getRegistration(input.userId) };
  if (existing && existing.status !== "PENDING") throw new Error("TX_ALREADY_USED");

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
    const verified = await verifyTokenTransfer({
      txHash: input.txHash,
      expectedPayer: input.payerWallet,
      expectedAmount: BigInt(prepared.amountUnits),
      expectedRecipient: prepared.recipient,
    });
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

export async function listUserPlans(userId: string) {
  const store = await readStore();
  return store.plans.map((plan) => {
    const tx = store.transactions.find(
      (t) => t.user_id === userId && t.plan_id === plan.id && t.status === "CONFIRMED",
    );
    return { ...plan, status: tx ? "ACTIVE" : "AVAILABLE", tx_hash: tx?.tx_hash ?? null };
  });
}

export type { TransactionRow };
