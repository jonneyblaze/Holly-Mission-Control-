"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Target,
  Users,
  Bot,
  KanbanSquare,
  CalendarDays,
  FileText,
  Headphones,
  Server,
  DollarSign,
  Gauge,
  MessageSquare,
  Archive,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Goals", href: "/goals", icon: Target },
  { name: "Pipeline", href: "/pipeline", icon: Users },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Tasks", href: "/tasks", icon: KanbanSquare },
  { name: "Social", href: "/social", icon: CalendarDays },
  { name: "Content", href: "/content", icon: FileText },
  { name: "Support", href: "/support", icon: Headphones },
  { name: "Infrastructure", href: "/infrastructure", icon: Server },
  { name: "Finance", href: "/finance", icon: DollarSign },
  { name: "Budget", href: "/budget", icon: Gauge },
  { name: "Feedback", href: "/feedback", icon: MessageSquare },
  { name: "Reports", href: "/reports", icon: Archive },
  { name: "Security", href: "/settings", icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col bg-navy-500 text-white transition-all duration-300 h-screen sticky top-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-montserrat font-bold tracking-tight truncate">
              Mission Control
            </h1>
            <p className="text-[10px] text-teal-300 font-medium">Holly&apos;s Command Centre</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-teal-500/20 text-teal-300"
                  : "text-navy-200 hover:bg-white/5 hover:text-white"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-white/10 text-navy-300 hover:text-white transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
