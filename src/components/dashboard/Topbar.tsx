"use client";

import { Bell, Search, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function Topbar() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  return (
    <header className="h-14 border-b border-border bg-white/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agents, tasks, reports..."
            className="h-9 w-72 pl-9 pr-4 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Refresh data"
        >
          <RefreshCw
            className={`w-4 h-4 text-muted-foreground ${
              refreshing ? "animate-spin" : ""
            }`}
          />
        </button>
        <button className="p-2 rounded-lg hover:bg-muted transition-colors relative">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-teal-500 rounded-full" />
        </button>
        <div className="w-8 h-8 rounded-full bg-navy-500 flex items-center justify-center ml-2">
          <span className="text-xs font-bold text-white">SM</span>
        </div>
      </div>
    </header>
  );
}
