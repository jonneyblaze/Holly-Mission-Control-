"use client";

/**
 * Per-agent OpenRouter keys panel — sits on the /budget page.
 *
 * Lists every known agent in the fleet with its current key state
 * (or a Create button if no key exists yet), and exposes row-level
 * actions: Reveal (decrypt), Rotate, Edit, Delete. All requests go
 * through `/api/budget/keys-ui/*` which are session-authed proxies
 * onto the bearer-authed `/api/budget/keys` endpoints.
 *
 * Known-agent list is hardcoded to match the Naboo fleet. When a new
 * agent is added to openclaw.json, its id should be added here too —
 * it's not pulled dynamically because the fleet moves slowly and the
 * openclaw.json isn't accessible from Mission Control.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Key,
  Plus,
  RefreshCw,
  Eye,
  Trash2,
  Pencil,
  Copy,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KNOWN_AGENTS } from "@/lib/known-agents";

interface KeyRow {
  id: string;
  agent_id: string;
  label: string;
  or_key_hash: string;
  monthly_limit_usd: number | null;
  disabled: boolean;
  last_rotated_at: string | null;
  created_at: string;
  updated_at: string;
  usage_usd: number | null;
  or_disabled: boolean | null;
  or_limit: number | null;
  usage_error: string | null;
}

export default function KeysPanel() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<KeyRow | null>(null);
  const [revealFor, setRevealFor] = useState<{ agent_id: string; api_key: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KeyRow | null>(null);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/budget/keys-ui", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRows(json.keys ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Usage numbers come from live OR calls — refresh every 2 min so
    // the table doesn't go stale but we're not hammering the API.
    const t = setInterval(load, 2 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const keysByAgent = new Map(rows.map((r) => [r.agent_id, r]));

  // Reveal auto-hides after 30s — capture elsewhere or it's gone.
  useEffect(() => {
    if (!revealFor) return;
    const t = setTimeout(() => setRevealFor(null), 30_000);
    return () => clearTimeout(t);
  }, [revealFor]);

  async function handleCreate(agent_id: string, label: string, limit: number | null) {
    setBusyAgent(agent_id);
    try {
      const res = await fetch("/api/budget/keys-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id, label, monthly_limit_usd: limit }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCreateFor(null);
      setRevealFor({ agent_id, api_key: json.api_key });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusyAgent(null);
    }
  }

  async function handleReveal(agent_id: string) {
    setBusyAgent(agent_id);
    try {
      const res = await fetch(`/api/budget/keys-ui/${encodeURIComponent(agent_id)}?reveal=1`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.api_key) throw new Error("Reveal did not return api_key");
      setRevealFor({ agent_id, api_key: json.api_key });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reveal failed");
    } finally {
      setBusyAgent(null);
    }
  }

  async function handleRotate(agent_id: string) {
    if (!confirm(`Rotate key for ${agent_id}? The old key will stop working immediately.`)) return;
    setBusyAgent(agent_id);
    try {
      const res = await fetch(`/api/budget/keys-ui/${encodeURIComponent(agent_id)}/rotate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRevealFor({ agent_id, api_key: json.api_key });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rotate failed");
    } finally {
      setBusyAgent(null);
    }
  }

  async function handleEdit(agent_id: string, patch: {
    label?: string;
    monthly_limit_usd?: number | null;
    disabled?: boolean;
  }) {
    setBusyAgent(agent_id);
    try {
      const res = await fetch(`/api/budget/keys-ui/${encodeURIComponent(agent_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setEditFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed");
    } finally {
      setBusyAgent(null);
    }
  }

  async function handleDelete(agent_id: string) {
    setBusyAgent(agent_id);
    try {
      const res = await fetch(`/api/budget/keys-ui/${encodeURIComponent(agent_id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyAgent(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-navy-500" />
          <h2 className="font-montserrat font-bold text-navy-500">Per-agent OpenRouter keys</h2>
        </div>
        <button
          onClick={() => load()}
          className="text-xs text-muted-foreground hover:text-navy-500 inline-flex items-center gap-1"
          disabled={loading}
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        One OpenRouter key per agent with per-agent spend caps enforced by OR &mdash; provisioned
        &amp; tracked here, <strong>not yet plumbed into Naboo</strong>. Naboo still uses the shared
        OR key; these keys give you separate OR dashboards, monthly limits, rotation, and kill-switch
        at the account level. Request-time per-agent isolation is a future step.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-5 py-2 font-medium">Agent</th>
              <th className="px-2 py-2 font-medium">Label</th>
              <th className="px-2 py-2 font-medium text-right">Limit</th>
              <th className="px-2 py-2 font-medium text-right">MTD usage</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {KNOWN_AGENTS.map(({ id, model_hint }) => {
              const row = keysByAgent.get(id);
              const busy = busyAgent === id;
              return (
                <tr
                  key={id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-slate-50/50"
                >
                  <td className="px-5 py-3">
                    <div className="font-semibold text-navy-500">{id}</div>
                    <div className="text-xs text-muted-foreground">{model_hint}</div>
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    {row ? row.label : <span className="italic opacity-50">—</span>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {row
                      ? row.monthly_limit_usd != null
                        ? `$${Number(row.monthly_limit_usd).toFixed(2)}`
                        : <span className="text-muted-foreground">no cap</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {row ? (
                      row.usage_error ? (
                        <span className="text-amber-600 text-xs" title={row.usage_error}>
                          OR error
                        </span>
                      ) : (
                        <>
                          ${(row.usage_usd ?? 0).toFixed(2)}
                          {row.monthly_limit_usd != null && row.usage_usd != null && (
                            <div className="text-xs text-muted-foreground">
                              {(
                                (row.usage_usd / Number(row.monthly_limit_usd)) *
                                100
                              ).toFixed(0)}
                              %
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {!row && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        No key
                      </span>
                    )}
                    {row && row.disabled && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Disabled
                      </span>
                    )}
                    {row && !row.disabled && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!row ? (
                      <button
                        onClick={() => setCreateFor(id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Create
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <IconButton
                          onClick={() => handleReveal(id)}
                          disabled={busy}
                          title="Reveal key"
                          icon={Eye}
                        />
                        <IconButton
                          onClick={() => setEditFor(row)}
                          disabled={busy}
                          title="Edit"
                          icon={Pencil}
                        />
                        <IconButton
                          onClick={() => handleRotate(id)}
                          disabled={busy}
                          title="Rotate (creates new, deletes old)"
                          icon={RefreshCw}
                        />
                        <IconButton
                          onClick={() => setConfirmDelete(row)}
                          disabled={busy}
                          title="Delete"
                          icon={Trash2}
                          danger
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {createFor && (
        <CreateKeyModal
          agent_id={createFor}
          onClose={() => setCreateFor(null)}
          onSubmit={handleCreate}
          busy={busyAgent === createFor}
        />
      )}

      {/* Edit modal */}
      {editFor && (
        <EditKeyModal
          row={editFor}
          onClose={() => setEditFor(null)}
          onSubmit={(patch) => handleEdit(editFor.agent_id, patch)}
          busy={busyAgent === editFor.agent_id}
        />
      )}

      {/* Reveal modal */}
      {revealFor && (
        <RevealKeyModal
          agent_id={revealFor.agent_id}
          api_key={revealFor.api_key}
          onClose={() => setRevealFor(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmDeleteModal
          row={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete.agent_id)}
          busy={busyAgent === confirmDelete.agent_id}
        />
      )}
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

function IconButton({
  onClick,
  disabled,
  title,
  icon: Icon,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded-md transition-colors disabled:opacity-50",
        danger
          ? "hover:bg-red-50 text-red-500 hover:text-red-700"
          : "hover:bg-slate-100 text-slate-500 hover:text-navy-500"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-montserrat font-bold text-navy-500">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateKeyModal({
  agent_id,
  onClose,
  onSubmit,
  busy,
}: {
  agent_id: string;
  onClose: () => void;
  onSubmit: (agent_id: string, label: string, limit: number | null) => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState(agent_id);
  const [limitStr, setLimitStr] = useState("");

  return (
    <ModalShell title={`Provision key · ${agent_id}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Label">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </Field>
        <Field label="Monthly limit (USD, blank = no cap)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={limitStr}
            onChange={(e) => setLimitStr(e.target.value)}
            placeholder="e.g. 25.00"
            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-navy-500"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit(
                agent_id,
                label.trim() || agent_id,
                limitStr.trim() ? Number(limitStr) : null
              )
            }
            disabled={busy}
            className="px-4 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {busy ? "Provisioning…" : "Provision"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditKeyModal({
  row,
  onClose,
  onSubmit,
  busy,
}: {
  row: KeyRow;
  onClose: () => void;
  onSubmit: (patch: { label?: string; monthly_limit_usd?: number | null; disabled?: boolean }) => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState(row.label);
  const [limitStr, setLimitStr] = useState(
    row.monthly_limit_usd != null ? String(row.monthly_limit_usd) : ""
  );
  const [disabled, setDisabled] = useState(row.disabled);

  return (
    <ModalShell title={`Edit · ${row.agent_id}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Label">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md"
          />
        </Field>
        <Field label="Monthly limit (USD, blank = no cap)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={limitStr}
            onChange={(e) => setLimitStr(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />
          Disabled (rejects all requests server-side at OR)
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-navy-500">
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                label: label.trim() || row.agent_id,
                monthly_limit_usd: limitStr.trim() ? Number(limitStr) : null,
                disabled,
              })
            }
            disabled={busy}
            className="px-4 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function RevealKeyModal({
  agent_id,
  api_key,
  onClose,
}: {
  agent_id: string;
  api_key: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <ModalShell title={`Key revealed · ${agent_id}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            Copy this now and paste it into openclaw.json on Naboo. This modal will auto-close in{" "}
            <strong>{secondsLeft}s</strong>. The key is not logged anywhere client-side and will
            need to be re-revealed if dismissed.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-slate-50 border border-border rounded-md font-mono text-xs break-all">
            {api_key}
          </code>
          <button
            onClick={copy}
            className="p-2 rounded-md bg-teal-500 hover:bg-teal-600 text-white flex-shrink-0"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copied && (
          <div className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Copied to clipboard
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function ConfirmDeleteModal({
  row,
  onClose,
  onConfirm,
  busy,
}: {
  row: KeyRow;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <ModalShell title={`Delete key · ${row.agent_id}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-xs">
          This will delete the key on OpenRouter and remove it from the DB. If Naboo is still
          using this key, the agent will immediately start getting 401s. Make sure to remove it
          from openclaw.json first.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-navy-500">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-1.5 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {busy ? "Deleting…" : "Delete key"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
