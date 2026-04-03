"use client";

import { useState, useEffect, useCallback } from "react";

interface UseFetchOptions {
  refreshInterval?: number; // ms, 0 = no auto-refresh
}

export function useBodylyticsRpc<T = unknown>(
  rpc: string,
  options: UseFetchOptions = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/bodylytics?rpc=${rpc}`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    fetchData();
    if (options.refreshInterval && options.refreshInterval > 0) {
      const interval = setInterval(fetchData, options.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

export function useBodylyticsTable<T = unknown>(
  table: string,
  select = "*",
  limit = 100,
  options: UseFetchOptions = {}
) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ table, select, limit: String(limit) });
      const res = await fetch(`/api/bodylytics?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [table, select, limit]);

  useEffect(() => {
    fetchData();
    if (options.refreshInterval && options.refreshInterval > 0) {
      const interval = setInterval(fetchData, options.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, options.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}
