"use client";

import { useState } from "react";
import type { TestingResult, TestCheck } from "@/types";

// ─── Status config ────────────────────────────────────────────────────────────

const CHECK_STATUS_CONFIG: Record<
  TestCheck["status"],
  { label: string; dotClass: string; textClass: string; bgClass: string; borderClass: string }
> = {
  pass:    { label: "Pass",    dotClass: "bg-[#3fb950]", textClass: "text-[#3fb950]", bgClass: "bg-[#0d2114]", borderClass: "border-[#238636]" },
  warning: { label: "Warning", dotClass: "bg-[#e3b341]", textClass: "text-[#e3b341]", bgClass: "bg-[#2d2500]", borderClass: "border-[#6b5200]" },
  fail:    { label: "Fail",    dotClass: "bg-[#f85149]", textClass: "text-[#f85149]", bgClass: "bg-[#2d0f0f]", borderClass: "border-[#6b1a1a]" },
  info:    { label: "Info",    dotClass: "bg-[#8b949e]", textClass: "text-[#8b949e]", bgClass: "bg-[#21262d]", borderClass: "border-[#30363d]" },
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  react:   "React / Next.js",
  node:    "Node.js / TypeScript",
  python:  "Python",
  unknown: "Unknown",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckRow({ check }: { check: TestCheck }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = CHECK_STATUS_CONFIG[check.status];

  return (
    <div className={`border rounded-lg overflow-hidden ${cfg.borderClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#161b22] transition-colors"
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />

        {/* Label */}
        <span className="flex-1 text-sm text-[#e6edf3] leading-snug">{check.label}</span>

        {/* Badge */}
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded shrink-0 ${cfg.bgClass} ${cfg.textClass}`}>
          {cfg.label}
        </span>

        {/* Analysis mode badge */}
        <span className="text-[10px] text-[#484f58] shrink-0 ml-1 font-mono">
          {check.analysisType === "static" ? "static" : "executed"}
        </span>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-[#8b949e] shrink-0 transition-transform ml-1 ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[#21262d] flex flex-col gap-2">
          <p className="text-xs text-[#8b949e] leading-relaxed">{check.detail}</p>
          <p className="text-[11px] text-[#484f58] italic">
            ℹ️ Analysis mode: <span className="font-mono not-italic text-[#484f58]">{check.analysisType === "static" ? "static analysis — no tests were executed" : "live execution"}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function StatBadge({ count, label, colorClass }: { count: number; label: string; colorClass: string }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold font-mono ${colorClass}`}>{count}</span>
      <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TestingPanelProps {
  result: TestingResult;
}

export default function TestingPanel({ result }: TestingPanelProps) {
  const [activeFilter, setActiveFilter] = useState<TestCheck["status"] | "all">("all");

  const filteredChecks =
    activeFilter === "all"
      ? result.checks
      : result.checks.filter((c) => c.status === activeFilter);

  const filterOptions: Array<{ value: TestCheck["status"] | "all"; label: string }> = [
    { value: "all",     label: "All" },
    { value: "fail",    label: "Fail" },
    { value: "warning", label: "Warning" },
    { value: "pass",    label: "Pass" },
    { value: "info",    label: "Info" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Test-tube icon */}
          <div className="w-7 h-7 rounded-md bg-[#1a2634] border border-[#1f6feb]/30 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[#58a6ff]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z" />
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#e6edf3]">
              Testing Agent
              <span className="ml-2 text-xs text-[#8b949e] font-normal">
                {result.checks.length} check{result.checks.length !== 1 ? "s" : ""}
              </span>
            </h2>
            <p className="text-[11px] text-[#484f58]">
              {PROJECT_TYPE_LABEL[result.projectType] ?? result.projectType} ·{" "}
              {result.checkedFiles.length} file{result.checkedFiles.length !== 1 ? "s" : ""} analysed
            </p>
          </div>
        </div>

        {/* Overall pass/fail badge */}
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
            result.passed
              ? "bg-[#0d2114] border-[#238636]/40 text-[#3fb950]"
              : "bg-[#2d0f0f] border-[#6b1a1a]/60 text-[#f85149]"
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${result.passed ? "bg-[#3fb950]" : "bg-[#f85149]"}`} />
          {result.passed ? "All checks passed" : "Issues detected"}
        </div>
      </div>

      {/* ── Static analysis notice ──────────────────────────────── */}
      <div className="flex items-start gap-2.5 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3">
        <svg className="w-4 h-4 text-[#8b949e] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-6.25a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0Z" />
        </svg>
        <p className="text-xs text-[#8b949e] leading-relaxed">
          <span className="text-[#e6edf3] font-medium">Static analysis mode</span> — no test files were executed.
          All results are derived from structural inspection of changed file paths, diff metadata, and known
          project patterns. Findings indicate potential gaps or configuration concerns, not confirmed failures.
        </p>
      </div>

      {/* ── Stats row ───────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl px-6 py-4">
        <div className="flex items-center justify-around gap-6">
          <StatBadge count={result.stats.fail}    label="Fail"    colorClass="text-[#f85149]" />
          <StatBadge count={result.stats.warn}    label="Warning" colorClass="text-[#e3b341]" />
          <StatBadge count={result.stats.pass}    label="Pass"    colorClass="text-[#3fb950]" />
          <StatBadge count={result.stats.info}    label="Info"    colorClass="text-[#8b949e]" />
          {/* Checked files */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-lg font-bold font-mono text-[#58a6ff]">{result.checkedFiles.length}</span>
            <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Files</span>
          </div>
        </div>

        {/* Summary sentence */}
        <p className="mt-4 text-xs text-[#8b949e] leading-relaxed border-t border-[#21262d] pt-3">
          {result.summary}
        </p>
      </div>

      {/* ── Checked files list ──────────────────────────────────── */}
      {result.checkedFiles.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-widest mb-1">
            Analysed files
          </p>
          <div className="flex flex-wrap gap-2">
            {result.checkedFiles.map((file) => (
              <span
                key={file}
                className="text-[11px] font-mono bg-[#0d1117] border border-[#30363d] text-[#8b949e] px-2 py-1 rounded"
              >
                {file}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter tabs ─────────────────────────────────────────── */}
      {result.checks.length > 0 && (
        <div className="flex gap-1 bg-[#161b22] border border-[#30363d] rounded-xl p-1 w-fit">
          {filterOptions.map((opt) => {
            const count =
              opt.value === "all"
                ? result.checks.length
                : result.checks.filter((c) => c.status === opt.value).length;
            return (
              <button
                key={opt.value}
                onClick={() => setActiveFilter(opt.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeFilter === opt.value
                    ? "bg-[#7c5cd8] text-white"
                    : "text-[#8b949e] hover:text-white"
                }`}
              >
                {opt.label}
                {count > 0 && (
                  <span className="ml-1 opacity-70">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Check list ──────────────────────────────────────────── */}
      {filteredChecks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <svg className="w-7 h-7 text-[#3fb950] mb-2" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
          <p className="text-sm text-[#8b949e]">No checks for this filter</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredChecks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}
