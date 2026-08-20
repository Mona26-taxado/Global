export function routingLabel(role?: string | null, slot?: number | null) {
  if (role === "SPONSOR" || slot === 1) return "Direct #1 → Sponsor";
  if (role === "GLOBAL_UPLINE" || slot === 2) return "Direct #2 → Global upline";
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
  user?: { id?: string; referral_code: string; display_name: string; is_demo: boolean };
};

export function parentOf(tree: NetNode[], node: NetNode | undefined) {
  if (!node?.parent_id) return null;
  return tree.find((n) => n.id === node.parent_id) ?? null;
}
