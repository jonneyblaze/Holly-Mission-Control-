import { NextRequest } from "next/server";
import { forwardToKeysApi, requireDashboardUser } from "@/lib/ui-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ agent_id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const unauth = await requireDashboardUser(request);
  if (unauth) return unauth;
  const { agent_id } = await params;
  return forwardToKeysApi(
    request,
    `/api/budget/keys/${encodeURIComponent(agent_id)}/rotate`,
    { method: "POST" }
  );
}
