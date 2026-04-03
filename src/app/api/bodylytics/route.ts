import { NextRequest, NextResponse } from "next/server";
import { createBodylyticsClient } from "@/lib/bodylytics";

// Simple in-memory cache (5 min TTL)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rpc = searchParams.get("rpc");
  const table = searchParams.get("table");

  if (!rpc && !table) {
    return NextResponse.json(
      { error: "Provide ?rpc=<name> or ?table=<name>" },
      { status: 400 }
    );
  }

  const cacheKey = rpc || table || "";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT" },
    });
  }

  try {
    const supabase = createBodylyticsClient();

    let data: unknown;

    if (rpc) {
      const { data: rpcData, error } = await supabase.rpc(rpc);
      if (error) throw error;
      data = rpcData;
    } else if (table) {
      const select = searchParams.get("select") || "*";
      const limit = parseInt(searchParams.get("limit") || "100");
      const { data: tableData, error } = await supabase
        .from(table)
        .select(select)
        .limit(limit)
        .order("created_at", { ascending: false });
      if (error) throw error;
      data = tableData;
    }

    cache.set(cacheKey, { data, ts: Date.now() });

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[bodylytics-proxy] ${rpc || table} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
