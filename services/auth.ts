import { randomBytes } from "crypto";
import { isAddress, verifyMessage } from "viem";
import { assignSponsor, createUser, findSponsorByCode } from "@/services/users";
import { newId, readStore, withStore } from "@/lib/store";
import { activeChainId, appUrl } from "@/lib/network-config";
import type { UserRow } from "@/types";

const NONCE_TTL_MS = 10 * 60 * 1000;

export function loginMessage(address: string, nonce: string) {
  return [
    "Sign this message to authenticate with GLOBAL X.",
    "This signature does not transfer funds.",
    `Nonce: ${nonce}`,
    `Domain: ${new URL(appUrl()).host}`,
    `Address: ${address}`,
  ].join("\n");
}

export async function issueNonce(address: string) {
  if (!isAddress(address)) throw new Error("INVALID_ADDRESS");
  const nonce = randomBytes(16).toString("hex");
  await withStore((store) => {
    store.nonces.push({
      id: newId("nonce"),
      address: address.toLowerCase(),
      nonce,
      used: false,
      expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
    });
  });
  return { nonce, message: loginMessage(address.toLowerCase(), nonce) };
}

export async function verifyLogin(input: {
  address: string;
  signature: `0x${string}`;
  referralCode?: string;
  walletType?: string;
}): Promise<UserRow> {
  const address = input.address.toLowerCase() as `0x${string}`;
  const row = await withStore((store) => {
    const nonceRow = store.nonces
      .filter((n) => n.address === address && !n.used && new Date(n.expires_at) > new Date())
      .sort((a, b) => (a.expires_at < b.expires_at ? 1 : -1))[0];
    if (!nonceRow) throw new Error("NONCE_INVALID");
    return nonceRow;
  });

  const valid = await verifyMessage({
    address,
    message: loginMessage(address, row.nonce),
    signature: input.signature,
  });
  if (!valid) throw new Error("SIGNATURE_INVALID");

  await withStore((store) => {
    const n = store.nonces.find((x) => x.id === row.id);
    if (n) n.used = true;
  });

  const snapshot = await readStore();
  const existing = snapshot.wallets.find((w) => w.address === address);
  if (existing) {
    const user = snapshot.users.find((u) => u.id === existing.user_id);
    if (!user) throw new Error("USER_NOT_FOUND");
    return user;
  }

  if (input.referralCode) {
    findSponsorByCode(snapshot.users, input.referralCode, "new");
  }

  const user = await createUser({ display_name: "Member", is_demo: false });
  if (input.referralCode) await assignSponsor(user.id, input.referralCode);

  await withStore((store) => {
    store.wallets.push({
      id: newId("wal"),
      user_id: user.id,
      address,
      wallet_type: input.walletType ?? "injected",
      chain_id: activeChainId(),
      verified: true,
      created_at: new Date().toISOString(),
    });
    store.registrations.push({
      id: newId("reg"),
      user_id: user.id,
      status: "NOT_PAID",
      amount: "5000000",
      tx_hash: null,
      created_at: new Date().toISOString(),
      activated_at: null,
    });
  });

  const after = await readStore();
  return after.users.find((u) => u.id === user.id)!;
}
