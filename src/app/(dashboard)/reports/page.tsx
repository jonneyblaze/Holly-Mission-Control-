"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search,
  Download,
  X,
  FileText,
  Clock,
  Bot,
  Maximize2,
  Copy,
  Check,
  Filter,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useMCTable } from "@/lib/hooks/use-mission-control";

interface Report {
  id: string;
  agent_id: string;
  activity_type: string;
  title: string;
  summary: string;
  full_content?: string | null;
  workflow?: string;
  metadata?: Record<string, unknown>;
  status: string;
  created_at: string;
}

const agentEmojis: Record<string, string> = {
  holly: "📋",
  "bl-marketing": "📈",
  "bl-social": "📱",
  "bl-community": "🤝",
  "bl-content": "✍️",
  "bl-support": "🎧",
  "bl-qa": "🧪",
  infra: "🏗️",
  devops: "⚙️",
  "duracell-prep": "💼",
};

const agentNames: Record<string, string> = {
  holly: "Holly",
  "bl-marketing": "Marketing",
  "bl-social": "Social",
  "bl-community": "Community",
  "bl-content": "Content",
  "bl-support": "Support",
  "bl-qa": "QA",
  infra: "Infra",
  devops: "DevOps",
  "duracell-prep": "Duracell Prep",
};

const typeBadgeColors: Record<string, string> = {
  report: "bg-blue-100 text-blue-700",
  alert: "bg-red-100 text-red-700",
  content: "bg-purple-100 text-purple-700",
  task_complete: "bg-emerald-100 text-emerald-700",
  social_post: "bg-sky-100 text-sky-700",
  infra_snapshot: "bg-teal-100 text-teal-700",
  goal_snapshot: "bg-amber-100 text-amber-700",
  kb_gap: "bg-orange-100 text-orange-700",
  clarification: "bg-amber-100 text-amber-700",
  lead_snapshot: "bg-indigo-100 text-indigo-700",
};

// Simple markdown-to-HTML renderer for agent reports
function renderMarkdown(md: string): string {
  return md
    // Code blocks (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto text-sm my-3 font-mono"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-navy-500 mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-navy-500 mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-navy-500 mt-6 mb-3">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="font-bold"><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-slate-600">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-600">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-slate-200 my-4" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-teal-600 underline hover:text-teal-700">$1</a>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-teal-300 pl-4 py-1 my-2 text-slate-600 italic">$1</blockquote>')
    // Tables (basic)
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ""; // Skip separator rows
      const tag = cells.every((c) => c === c.toUpperCase() && c.length > 1) ? "th" : "td";
      return `<tr>${cells.map((c) => `<${tag} class="border border-slate-200 px-3 py-1.5 text-sm">${c}</${tag}>`).join("")}</tr>`;
    })
    // Wrap consecutive <tr> in <table>
    .replace(
      /(<tr>[\s\S]*?<\/tr>\n?)+/g,
      '<table class="w-full border-collapse my-3 text-sm">$&</table>'
    )
    // Paragraphs — wrap remaining lines
    .replace(/^(?!<[a-z])((?!<[a-z]).+)$/gm, (match) => {
      if (!match.trim()) return "";
      return `<p class="text-slate-600 leading-relaxed my-1.5">${match}</p>`;
    });
}

// ---------- Report Detail Modal ----------
function ReportModal({
  report,
  onClose,
}: {
  report: Report;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const content = report.full_content || report.summary || "No content available.";
  const renderedContent = renderMarkdown(content);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl mt-0.5">
              {agentEmojis[report.agent_id] || "🤖"}
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-montserrat font-bold text-navy-500 pr-8">
                {report.title}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge
                  className={cn(
                    "text-xs",
                    typeBadgeColors[report.activity_type] || "bg-slate-100"
                  )}
                >
                  {report.activity_type.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  {agentNames[report.agent_id] || report.agent_id}
                </span>
                {report.workflow && (
                  <span className="text-xs text-muted-foreground">
                    · {report.workflow}
                  </span>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(report.created_at), "PPp")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Download as markdown"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {report.summary && report.full_content && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-700">Summary:</strong>{" "}
              {report.summary}
            </p>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div
            className="prose-report max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        </div>

        {/* Metadata footer */}
        {report.metadata && Object.keys(report.metadata).length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 flex-shrink-0 bg-slate-50">
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-slate-600 font-medium">
                Metadata
              </summary>
              <pre className="mt-2 bg-slate-100 rounded-lg p-3 overflow-x-auto text-slate-600 font-mono">
                {JSON.stringify(report.metadata, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data: liveData, loading } = useMCTable<Report>("agent_activity", {
    realtime: true,
    limit: 500,
    select:
      "id, agent_id, activity_type, title, summary, full_content, workflow, metadata, status, created_at",
  });

  // Filter out trigger-type entries (internal plumbing, not useful as reports)
  const reports = useMemo(() => {
    return (liveData || []).filter(
      (r) => r.activity_type !== "trigger"
    );
  }, [liveData]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const matchesSearch =
        !searchQuery ||
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.summary || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.agent_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAgent = !filterAgent || r.agent_id === filterAgent;
      const matchesType = !filterType || r.activity_type === filterType;
      return matchesSearch && matchesAgent && matchesType;
    });
  }, [reports, searchQuery, filterAgent, filterType]);

  const agents = useMemo(
    () => Array.from(new Set(reports.map((r) => r.agent_id))).sort(),
    [reports]
  );
  const types = useMemo(
    () => Array.from(new Set(reports.map((r) => r.activity_type))).sort(),
    [reports]
  );

  // Stats
  const totalWithContent = reports.filter((r) => r.full_content).length;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Modal */}
      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold text-navy-500">
            Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {reports.length} agent outputs · {totalWithContent} with full content
            {loading && " · loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "gap-1.5",
              showFilters && "bg-slate-100"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {(filterAgent || filterType) && (
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            )}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search reports by title, content, or agent..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full pl-9 pr-4 rounded-xl bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
          {/* Agent filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">Agent:</span>
            <button
              onClick={() => setFilterAgent(null)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                !filterAgent
                  ? "bg-navy-500 text-white"
                  : "bg-white border text-muted-foreground hover:bg-white/80"
              )}
            >
              All
            </button>
            {agents.map((agent) => (
              <button
                key={agent}
                onClick={() =>
                  setFilterAgent(agent === filterAgent ? null : agent)
                }
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  filterAgent === agent
                    ? "bg-navy-500 text-white"
                    : "bg-white border text-muted-foreground hover:bg-white/80"
                )}
              >
                {agentEmojis[agent] || "🤖"}{" "}
                {agentNames[agent] || agent}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-1.5 border-l border-slate-300 pl-3 ml-1">
            <span className="text-xs font-medium text-slate-500">Type:</span>
            <button
              onClick={() => setFilterType(null)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                !filterType
                  ? "bg-navy-500 text-white"
                  : "bg-white border text-muted-foreground hover:bg-white/80"
              )}
            >
              All
            </button>
            {types.map((type) => (
              <button
                key={type}
                onClick={() =>
                  setFilterType(type === filterType ? null : type)
                }
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  filterType === type
                    ? "bg-navy-500 text-white"
                    : "bg-white border text-muted-foreground hover:bg-white/80"
                )}
              >
                {type.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* Clear */}
          {(filterAgent || filterType) && (
            <button
              onClick={() => {
                setFilterAgent(null);
                setFilterType(null);
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors ml-auto"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && reports.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-lg font-medium text-slate-500">No reports found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || filterAgent || filterType
              ? "Try adjusting your search or filters"
              : "Agent reports will appear here as they come in"}
          </p>
        </div>
      )}

      {/* Report List */}
      <div className="space-y-2">
        {filtered.map((report) => {
          const hasContent = !!report.full_content;
          return (
            <div
              key={report.id}
              onClick={() => setSelectedReport(report)}
              className={cn(
                "bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer group",
                hasContent
                  ? "border-border hover:border-teal-300"
                  : "border-border/60"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Agent emoji */}
                <span className="text-xl mt-0.5 flex-shrink-0">
                  {agentEmojis[report.agent_id] || "🤖"}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-navy-500 group-hover:text-teal-600 transition-colors">
                      {report.title}
                    </h3>
                    <Badge
                      className={cn(
                        "text-[10px]",
                        typeBadgeColors[report.activity_type] || "bg-slate-100"
                      )}
                    >
                      {report.activity_type.replace(/_/g, " ")}
                    </Badge>
                    {hasContent && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-teal-600 border-teal-200"
                      >
                        <FileText className="w-2.5 h-2.5 mr-0.5" />
                        Full report
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {agentNames[report.agent_id] || report.agent_id}
                    {report.workflow && <> · {report.workflow}</>}
                    {" · "}
                    {formatDistanceToNow(new Date(report.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                  {report.summary && (
                    <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">
                      {report.summary}
                    </p>
                  )}
                </div>

                {/* Open indicator */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-4 h-4 text-teal-500" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more hint */}
      {filtered.length >= 500 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing most recent 500 entries
        </p>
      )}
    </div>
  );
}
