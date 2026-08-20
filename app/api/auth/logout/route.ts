import { jsonOk } from "@/lib/http";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return jsonOk();
}
