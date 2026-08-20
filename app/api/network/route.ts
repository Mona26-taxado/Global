import { jsonOk } from "@/lib/http";
import { getNetwork } from "@/services/users";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return jsonOk({ tree: await getNetwork(), config: store.global_config });
}
