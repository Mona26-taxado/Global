import { createUser, placeUser } from "@/services/users";
import { readStore, withStore } from "@/lib/store";
import { basePlan } from "@/lib/plan-progress";

export async function ensureDemoNetwork(count = 250) {
  const current = await readStore();
  if (current.users.filter((u) => u.is_demo).length >= count) return;
  const ids: string[] = [];
  const baseId = basePlan(current.plans)?.id;
  for (let i = 0; i < count; i += 1) {
    const user = await createUser({ display_name: `Demo ${i + 1}`, is_demo: true, id: `demo_${i + 1}` });
    ids.push(user.id);
    if (i > 0) {
      const store = await readStore();
      const sponsor = store.users.find((u) => u.id === ids[Math.floor((i - 1) / 2)]);
      if (sponsor) {
        try {
          await withStore((s) => {
            const row = s.users.find((u) => u.id === user.id);
            if (row && !row.sponsor_id) {
              row.sponsor_id = sponsor.id;
              s.referrals.push({
                id: `dref_${i}`,
                user_id: user.id,
                sponsor_id: sponsor.id,
                referral_code: sponsor.referral_code,
              });
            }
          });
        } catch {
          /* demo tree still places */
        }
      }
    }
    await placeUser(user.id, baseId);
  }
}
