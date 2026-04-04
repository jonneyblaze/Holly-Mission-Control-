"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, CheckCircle2, AlertTriangle, MessageCircleQuestion, Zap, FileText, Globe, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface Notification {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string | null;
  status: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const agentEmojis: Record<string, string> = {
  holly: "📋",
  "bl-social": "📱",
  "bl-community": "🤝",
  "bl-marketing": "📈",
  "bl-content": "✍️",
  "duracell-prep": "💼",
  "bl-support": "🎧",
  "bl-qa": "🧪",
  infra: "🏗️",
  devops: "⚙️",
};

const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
  task_complete: { icon: CheckCircle2, color: "text-emerald-500" },
  clarification: { icon: MessageCircleQuestion, color: "text-amber-500" },
  alert: { icon: AlertTriangle, color: "text-red-500" },
  report: { icon: FileText, color: "text-slate-500" },
  content: { icon: FileText, color: "text-purple-500" },
  social_post: { icon: Globe, color: "text-blue-500" },
};

const typeLinks: Record<string, string> = {
  task_complete: "/tasks",
  clarification: "/tasks",
  social_post: "/social",
  content: "/content",
  report: "/reports",
  alert: "/infrastructure",
  infra_snapshot: "/infrastructure",
  kb_gap: "/support",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("agent_activity")
        .select("id, agent_id, activity_type, title, summary, status, created_at, metadata")
        .not("activity_type", "eq", "trigger")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter((n: Notification) => n.status === "new").length);
    } catch (err) {
      console.error("[notifications] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_activity" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new as Notification;
          if (row.activity_type === "trigger") return;
          setNotifications((prev) => [row, ...prev].slice(0, 30));
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Mark all as read
  const markAllRead = async () => {
    try {
      await supabase
        .from("agent_activity")
        .update({ status: "reviewed" })
        .eq("status", "new");
      setNotifications((prev) => prev.map((n) => ({ ...n, status: "reviewed" })));
      setUnreadCount(0);
    } catch (err) {
      console.error("[notifications] mark read error:", err);
    }
  };

  // Mark single as read
  const markRead = async (id: string) => {
    try {
      await supabase.from("agent_activity").update({ status: "reviewed" }).eq("id", id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: "reviewed" } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-muted transition-colors relative"
      >
        <Bell className={cn("w-4 h-4", unreadCount > 0 ? "text-navy-500" : "text-muted-foreground")} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[9px] font-bold text-white leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border border-border/80 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-slate-50/50">
            <h3 className="text-sm font-bold text-navy-500">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] font-medium text-teal-600 hover:text-teal-700 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border/30">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const typeInfo = typeIcons[notif.activity_type];
                const TypeIcon = typeInfo?.icon || Zap;
                const iconColor = typeInfo?.color || "text-slate-400";
                const isUnread = notif.status === "new";
                const link = typeLinks[notif.activity_type] || "/agents";

                return (
                  <Link
                    key={notif.id}
                    href={link}
                    onClick={() => {
                      if (isUnread) markRead(notif.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer",
                      isUnread && "bg-teal-50/40"
                    )}
                  >
                    {/* Agent emoji */}
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                      {agentEmojis[notif.agent_id] || "🤖"}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <TypeIcon className={cn("w-3 h-3 flex-shrink-0", iconColor)} />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          {notif.activity_type.replace(/_/g, " ")}
                        </span>
                        {isUnread && (
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className={cn("text-xs leading-snug truncate", isUnread ? "font-semibold text-navy-500" : "text-navy-400")}>
                        {notif.title}
                      </p>
                      {notif.summary && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {notif.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-2.5 h-2.5 text-muted-foreground/50" />
                        <span className="text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border/50 px-4 py-2.5 bg-slate-50/50">
              <Link
                href="/reports"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
              >
                View all activity &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
