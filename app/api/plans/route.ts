import { jsonError, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getRegistration, listUserPlans } from "@/payments/service";

export async function GET() {
  try {
    const session = await requireUser();
    const registration = await getRegistration(session.userId!);
    if (registration?.status !== "ACTIVE") {
      return jsonError("Registration must be ACTIVE before plans are available.", 403);
    }
    return jsonOk({ plans: await listUserPlans(session.userId!) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "PLANS_FAILED");
  }
}
