"use client";

import { useState } from "react";
import { X, Copy, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared markdown renderer for agent output
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-slate-900 text-slate-100 rounded-lg p-4 my-3 overflow-x-auto text-xs font-mono"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-navy-500 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-navy-500 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-navy-500 mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-slate-600 text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-600 text-sm">$1</li>')
    .replace(/^---$/gm, '<hr class="border-slate-200 my-3" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-teal-600 underline hover:text-teal-700">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-teal-300 pl-4 py-1 my-2 text-slate-600 italic text-sm">$1</blockquote>')
    .replace(/^(?!<[a-z])((?!<[a-z]).+)$/gm, (match) => {
      if (!match.trim()) return "";
      return `<p class="text-sm text-slate-600 leading-relaxed my-1">${match}</p>`;
    });
}

interface ContentModalProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  emoji?: string;
  onClose: () => void;
}

export function ContentModal({
  title,
  subtitle,
  badge,
  badgeColor = "bg-teal-100 text-teal-700",
  content,
  summary,
  metadata,
  emoji,
  onClose,
}: ContentModalProps) {
  const [copied, setCopied] = useState(false);

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
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
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
        <div className="flex items-start justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {emoji && <span className="text-2xl mt-0.5">{emoji}</span>}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {badge && (
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", badgeColor)}>
                    {badge}
                  </span>
                )}
                {subtitle && (
                  <span className="text-xs text-muted-foreground">{subtitle}</span>
                )}
              </div>
              <h2 className="text-lg font-montserrat font-bold text-navy-500 pr-8">
                {title}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {summary && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-slate-700">
                <strong>Summary:</strong> {summary}
              </p>
            </div>
          )}

          <div
            className="max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />

          {/* Metadata */}
          {metadata && Object.keys(metadata).length > 0 && (
            <details className="mt-6 border-t border-slate-100 pt-4">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-slate-600 font-medium">
                Metadata
              </summary>
              <pre className="mt-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook-style helper: use as a click handler on any "View full output" text
export function ViewOutputButton({
  content,
  title,
  summary,
  badge,
  badgeColor,
  emoji,
  subtitle,
  metadata,
  className,
  label = "View full output",
}: {
  content: string;
  title: string;
  summary?: string;
  badge?: string;
  badgeColor?: string;
  emoji?: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn("text-[11px] text-teal-600 cursor-pointer hover:text-teal-700 font-medium", className)}
      >
        ▸ {label}
      </button>
      {open && (
        <ContentModal
          title={title}
          subtitle={subtitle}
          badge={badge}
          badgeColor={badgeColor}
          content={content}
          summary={summary}
          metadata={metadata}
          emoji={emoji}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
