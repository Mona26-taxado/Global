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
  email?: string;
  mobile?: string;
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
  direct_number?: 1 | 2;
  status?: "ACTIVE" | "REJECTED";
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
  sort_order: number;
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
  payment_type: "REGISTRATION" | "PLAN_PURCHASE" | "GLOBAL_REENTRY";
  plan_id: string | null;
  plan_code: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "REJECTED";
  failure_reason?: string | null;
  recipient_role?: "SPONSOR" | "GLOBAL_UPLINE" | "COMPANY_GENESIS" | "GLOBAL_REENTRY" | null;
  routing_slot?: 1 | 2 | null;
  direct_number?: 1 | 2 | null;
  global_parent_user_id?: string | null;
  position_id?: string | null;
  created_at: string;
  intent_id?: string | null;
  placement_status?: "OK" | "STALE_ROUTE" | "RECIPIENT_CHANGED" | null;
};

export type PaymentIntentKind = "DIRECT2_PLACEMENT" | "GLOBAL_REENTRY";

export type PaymentIntentStatus = "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED" | "STALE_ROUTE";

export type PaymentIntentRow = {
  id: string;
  kind: PaymentIntentKind;
  status: PaymentIntentStatus;
  buyer_user_id: string;
  mover_user_id: string;
  plan_id: string;
  amount_usd: number;
  candidate_parent_position_id: string | null;
  candidate_position: "LEFT" | "RIGHT" | null;
  candidate_depth: number;
  candidate_recipient_user_id: string | null;
  candidate_recipient_wallet: string | null;
  movement_user_id?: string | null;
  movement_from_position_id?: string | null;
  movement_parent_position_id?: string | null;
  movement_position?: "LEFT" | "RIGHT" | null;
  movement_depth?: number | null;
  movement_recipient_user_id?: string | null;
  movement_recipient_wallet?: string | null;
  skip_placement?: boolean;
  quoted_at: string;
  tx_hash?: string | null;
  placement_status?: "OK" | "STALE_ROUTE" | "RECIPIENT_CHANGED" | "BLOCKED_STALE_ROUTE" | "BLOCKED_ALREADY_FUNDED" | null;
};

export type NetworkPositionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  parent_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
  cycle: number;
  status?: "ACTIVE" | "HISTORY" | "RESERVED";
  started_at?: string;
  ended_at?: string | null;
  from_position_id?: string | null;
  recipient_user_id?: string | null;
  recipient_wallet?: string | null;
  reentry_tx_hash?: string | null;
  /** Direct #2 buyer whose plan payment funds this reserved movement. Blocks a second GLOBAL_REENTRY for the same cycle. */
  funded_by_user_id?: string | null;
  /** Explicit admin/genesis ROOT move. Never a substitute for a paid GLOBAL_REENTRY. */
  source?: "ADMIN_GENESIS_RECONCILIATION" | "LEGACY_FUNDED_MOVEMENT_RECONCILIATION" | string | null;
};

export type GlobalConfig = {
  qualification_rule: string;
  global_entry_condition: string;
  two_branch_cycle: string;
  placement_rule: string;
  cycle_completion: string;
  position_movement: string;
};
