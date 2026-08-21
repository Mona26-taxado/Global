export function routingLabel(role?: string | null, slot?: number | null) {
  if (role === "SPONSOR" || slot === 1) return "DIRECT FIRST";
  if (role === "GLOBAL_UPLINE" || slot === 2) return "GLOBAL SECOND";
  if (role === "GLOBAL_REENTRY") return "GLOBAL REENTRY";
  if (role === "COMPANY_GENESIS") return "Genesis → Company";
  return "Plan payment";
}

export type NetNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: string | null;
  depth: number;
  cycle?: number;
  status?: "ACTIVE" | "HISTORY" | "RESERVED";
  user?: { id?: string; referral_code: string; display_name: string; is_demo: boolean };
};

export function parentOf(tree: NetNode[], node: NetNode | undefined) {
  if (!node?.parent_id) return null;
  return tree.find((n) => n.id === node.parent_id) ?? null;
}
