import { NextRequest } from "next/server";
import { forwardToKeysApi, requireDashboardUser } from "@/lib/ui-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * UI-facing proxy for `/api/budget/keys`. Session-authed; forwards to
 * the bearer-authed upstream. See `src/lib/ui-session.ts` for details.
 */

export async function GET(request: NextRequest) {
  const unauth = await requireDashboardUser(request);
  if (unauth) return unauth;
  return forwardToKeysApi(request, "/api/budget/keys");
}

export async function POST(request: NextRequest) {
  const unauth = await requireDashboardUser(request);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  return forwardToKeysApi(request, "/api/budget/keys", { body });
}
