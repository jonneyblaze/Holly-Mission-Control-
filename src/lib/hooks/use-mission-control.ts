"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Hook for Mission Control's own Supabase tables with Realtime
export function useMCTable<T = Record<string, unknown>>(
  table: string,
  options: {
    select?: string;
    limit?: number;
    orderBy?: string;
    orderAsc?: boolean;
    filter?: Record<string, string>;
    realtime?: boolean;
  } = {}
) {
  const {
    select = "*",
    limit = 50,
    orderBy = "created_at",
    orderAsc = false,
    filter,
    realtime = false,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const filterKey = filter ? JSON.stringify(filter) : "";

  const fetchData = useCallback(async () => {
    try {
      let query = supabaseRef.current.from(table).select(select).limit(limit).order(orderBy, { ascending: orderAsc });

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      const { data: rows, error: err } = await query;
      if (err) {
        console.error(`[MC] ${table} query failed:`, err.message);
        throw err;
      }
      setData((rows as T[]) || []);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[MC] ${table} error:`, msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, select, limit, orderBy, orderAsc, filterKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!realtime) return;

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, realtime, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// Insert into Mission Control table
export function useMCInsert(table: string) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const insert = async (data: Record<string, unknown>) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase
        .from(table)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    } finally {
      setLoading(false);
    }
  };

  return { insert, loading };
}

// Update Mission Control table
export function useMCUpdate(table: string) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const update = async (id: string, data: Record<string, unknown>) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase
        .from(table)
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    } finally {
      setLoading(false);
    }
  };

  return { update, loading };
}
