/**
 * Helpers for UI-facing API routes that need to (a) verify the caller
 * is a logged-in dashboard user, and (b) forward the request to an
 * internal API route that uses `INGEST_API_KEY` bearer auth.
 *
 * The keys endpoints under `/api/budget/keys/*` use bearer auth so
 * they can be called by the cron + ops tools without session cookies.
 * The dashboard UI can't ship a bearer to the browser, so it hits the
 * session-authed `/api/budget/keys-ui/*` routes instead, which live
 * on top of this helper and forward server-side with the bearer.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Verify the caller has a valid Supabase session. Returns `null` on success, or a 401 response. */
export async function requireDashboardUser(
  request: NextRequest
): Promise<NextResponse | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // read-only for this check
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Forward a request to an internal `/api/budget/keys/*` path, injecting
 * the `INGEST_API_KEY` bearer. The upstream response body and status
 * are passed through verbatim — the UI gets exactly what the keys
 * endpoint would return, minus the bearer requirement.
 */
export async function forwardToKeysApi(
  request: NextRequest,
  upstreamPath: string,
  init?: { method?: string; body?: unknown }
): Promise<NextResponse> {
  const bearer = process.env.INGEST_API_KEY;
  if (!bearer) {
    return NextResponse.json(
      { error: "INGEST_API_KEY not configured" },
      { status: 500 }
    );
  }

  const method = init?.method ?? request.method;
  const origin = new URL(request.url).origin;
  const search = new URL(request.url).search;
  const target = `${origin}${upstreamPath}${search}`;

  const upstream = await fetch(target, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await upstream.text();
  // Pass the body + status through. Content-Type is always JSON for these routes.
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
