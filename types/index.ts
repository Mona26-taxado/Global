export type NetworkId = "amoy" | "mainnet";

export type WalletKind = "trust" | "tokenpocket" | "injected";

export type WalletPhase =
  | "IDLE"
  | "CONNECTING"
  | "OPENING_WALLET"
  | "WAITING_FOR_APPROVAL"
  | "CONNECTED"
  | "VERIFYING"
  | "AUTHENTICATED"
  | "WRONG_NETWORK"
  | "REJECTED"
  | "TIMEOUT"
  | "DISCONNECTED"
  | "ERROR";

export type UserRow = {
  id: string;
  referral_code: string;
  sponsor_id: string | null;
  is_demo: boolean;
  display_name: string;
  created_at: string;
};

export type WalletRow = {
  id: string;
  user_id: string;
  address: string;
  wallet_type: WalletKind | string;
  chain_id: number;
  verified: boolean;
  created_at: string;
};

export type NonceRow = {
  id: string;
  address: string;
  nonce: string;
  used: boolean;
  expires_at: string;
};

export type ReferralRow = {
  id: string;
  user_id: string;
  sponsor_id: string;
  referral_code: string;
};

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  amount_usd: number;
  token: string;
  network: string;
  description: string;
  active: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type RegistrationRow = {
  id: string;
  user_id: string;
  status: "NOT_PAID" | "PENDING" | "ACTIVE" | "FAILED";
  amount: string;
  tx_hash: string | null;
  created_at: string;
  activated_at: string | null;
};

export type TransactionRow = {
  id: string;
  user_id: string;
  payer_wallet: string;
  recipient_wallet: string;
  amount: string;
  token: string;
  token_contract: string;
  chain_id: number;
  tx_hash: string;
  payment_type: "REGISTRATION" | "PLAN_PURCHASE";
  plan_id: string | null;
  plan_code: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "REJECTED";
  failure_reason?: string | null;
  recipient_role?: "SPONSOR" | "GLOBAL_UPLINE" | "COMPANY_GENESIS" | null;
  routing_slot?: 1 | 2 | null;
  created_at: string;
};

export type NetworkPositionRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
  cycle: number;
};

export type GlobalConfig = {
  qualification_rule: string;
  global_entry_condition: string;
  two_branch_cycle: string;
  placement_rule: string;
  cycle_completion: string;
  position_movement: string;
};
