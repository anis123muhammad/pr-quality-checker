"use client";

import { useState, useRef } from "react";
import Navbar from "@/components/Navbar";
import ChatPanel from "@/components/ChatPanel";
import PRSubmitCard from "@/components/PRSubmitCard";
import ReviewProgress from "@/components/ReviewProgress";
import AgentPanel from "@/components/AgentPanel";
import FindingsPanel from "@/components/FindingsPanel";
import DiffViewer from "@/components/DiffViewer";
import TestingPanel from "@/components/TestingPanel";
import * as testingAgent from "@/lib/testingAgent";
import type { Agent, Finding, PRInfo, ReviewStatus, TestingResult } from "@/types";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_AGENTS: Agent[] = [
  {
    id: "security",
    name: "Security Agent",
    role: "Vulnerability scanner",
    description: "Scans for injection flaws, auth bypasses, secrets exposure, and insecure patterns relevant to the changed files.",
    status: "idle",
    icon: "security",
  },
  {
    id: "performance",
    name: "Performance Agent",
    role: "Bottleneck detector",
    description: "Identifies N+1 queries, expensive hot-path operations, and missing caching based on caller context.",
    status: "idle",
    icon: "performance",
  },
  {
    id: "test",
    name: "Test Agent",
    role: "Coverage analyser",
    description: "Checks that changed code paths have corresponding unit and integration tests. Flags uncovered branches.",
    status: "idle",
    icon: "test",
  },
  {
    id: "dependency",
    name: "Dependency Agent",
    role: "Dependency auditor",
    description: "Cross-references changed imports against vulnerability databases and checks for transitive conflicts.",
    status: "idle",
    icon: "dependency",
  },
  {
    id: "style",
    name: "Style Agent",
    role: "Standards enforcer",
    description: "Enforces repository-specific linting rules, naming conventions, and code style guidelines.",
    status: "idle",
    icon: "style",
  },
  {
    id: "context",
    name: "Context Agent",
    role: "Caller & impact tracer",
    description: "Retrieves callers, consumers, and configuration references impacted by the changed symbols.",
    status: "idle",
    icon: "context",
  },
];

const MOCK_FINDINGS: Finding[] = [
  {
    id: "f1",
    agentId: "security",
    agentName: "Security Agent",
    severity: "critical",
    title: "Non-null assertion on JWT_SECRET env variable",
    description:
      "process.env.JWT_SECRET! uses a non-null assertion. If the environment variable is absent at runtime, jwt.verify will receive undefined, causing a silent fallback to the string 'undefined' as the secret, completely bypassing authentication.",
    file: "src/middleware/auth.ts",
    line: 24,
    evidence: `const decoded = jwt.verify(token, process.env.JWT_SECRET!);
//                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^
// If JWT_SECRET is undefined, this becomes:
// jwt.verify(token, undefined)  →  effectively no secret validation`,
    evidenceType: "code",
    remediation:
      "Guard the variable explicitly: const secret = process.env.JWT_SECRET; if (!secret) throw new Error('JWT_SECRET is not set'); jwt.verify(token, secret);",
  },
  {
    id: "f2",
    agentId: "security",
    agentName: "Security Agent",
    severity: "high",
    title: "Type cast (decoded as any).sub hides validation gap",
    description:
      "Casting the JWT payload to any skips TypeScript's structural checks. The sub claim is not validated to be a string before being passed to db.users.findById, which may accept arbitrary input.",
    file: "src/middleware/auth.ts",
    line: 25,
    evidence: `const user = await db.users.findById((decoded as any).sub);
//                                               ^^^^^^^^^^^^^^^^
// decoded.sub is never validated as a non-empty string`,
    evidenceType: "code",
    remediation: "Define a JwtPayload interface and validate sub with a type guard before the DB call.",
  },
  {
    id: "f3",
    agentId: "test",
    agentName: "Test Agent",
    severity: "high",
    title: "No tests cover the new Bearer token validation path",
    description:
      "The updated authMiddleware introduces a Bearer prefix check and an async DB user lookup. Neither path is exercised in the existing test suite.",
    file: "tests/middleware/auth.test.ts",
    evidence: `// Existing test:
it('rejects missing token', async () => { ... }); // ✓ covered
it('rejects invalid token', async () => { ... }); // ✓ covered

// Missing:
it('rejects malformed Bearer prefix', ...); // ✗ not found
it('returns 401 when user not in DB', ...); // ✗ not found`,
    evidenceType: "test",
    remediation: "Add test cases for: (1) header without 'Bearer ' prefix, (2) valid token but user deleted from DB.",
  },
  {
    id: "f4",
    agentId: "performance",
    agentName: "Performance Agent",
    severity: "medium",
    title: "Synchronous DB lookup on every authenticated request",
    description:
      "db.users.findById is called on every request through authMiddleware. With no caching layer, high-traffic endpoints will issue a DB round-trip per request.",
    file: "src/middleware/auth.ts",
    line: 25,
    evidence: `// authMiddleware is applied to all routes:
app.use('/api', authMiddleware, router);  // ← src/app.ts:18

// Every request hits:
const user = await db.users.findById((decoded as any).sub);  // DB I/O`,
    evidenceType: "caller",
    remediation: "Cache the user record in a short-lived in-memory or Redis store keyed by sub to reduce DB load.",
  },
  {
    id: "f5",
    agentId: "context",
    agentName: "Context Agent",
    severity: "low",
    title: "5 callers depend on req.user shape change",
    description:
      "Previously req.user was set to the raw JWT decoded payload. It is now the full DB user object. Five downstream route handlers access fields (e.g. req.user.role) that may differ between the two shapes.",
    file: "src/routes/profile.ts",
    line: 8,
    evidence: `// src/routes/profile.ts:8
const { id, role, email } = req.user; // previously from JWT payload

// src/routes/admin.ts:14
if (req.user.role !== 'admin') return res.status(403)...

// +3 more callers in src/routes/`,
    evidenceType: "caller",
    remediation: "Audit all req.user accesses. Ensure the DB user model exposes the same fields the JWT payload previously provided, or update callers.",
  },
  {
    id: "f6",
    agentId: "dependency",
    agentName: "Dependency Agent",
    severity: "info",
    title: "jsonwebtoken 8.5.1 — newer version available (9.0.2)",
    description:
      "The project uses jsonwebtoken 8.5.1. Version 9.0.2 resolves a CVE related to algorithm confusion attacks. No breaking API changes.",
    file: "package.json",
    evidence: `"dependencies": {
  "jsonwebtoken": "^8.5.1"   // current
  // latest: 9.0.2 — fixes CVE-2022-23529
}`,
    evidenceType: "dependency",
    remediation: "Run: npm install jsonwebtoken@9.0.2",
  },
];

// ─── Review pipeline simulation ───────────────────────────────────────────────

const REVIEW_STEPS: ReviewStatus[] = [
  "loading_context",
  "activating_agents",
  "reviewing",
  "verifying",
  "done",
];

const AGENT_SCHEDULE: Array<{ delay: number; updates: Partial<Agent>[] }> = [
  { delay: 800,  updates: [{ id: "context",     status: "activating" }] },
  { delay: 1600, updates: [{ id: "context",     status: "running" }, { id: "security", status: "activating" }, { id: "test", status: "activating" }] },
  { delay: 2800, updates: [{ id: "context",     status: "done", findingsCount: 1 }, { id: "security", status: "running" }, { id: "performance", status: "activating" }] },
  { delay: 3600, updates: [{ id: "test",        status: "running" }, { id: "dependency", status: "activating" }, { id: "style", status: "activating" }] },
  { delay: 4800, updates: [{ id: "security",    status: "done", findingsCount: 2 }, { id: "performance", status: "running" }] },
  { delay: 5600, updates: [{ id: "test",        status: "done", findingsCount: 1 }, { id: "style", status: "done", findingsCount: 0 }] },
  { delay: 6400, updates: [{ id: "performance", status: "done", findingsCount: 1 }, { id: "dependency", status: "done", findingsCount: 1 }] },
];

const FINDING_SCHEDULE: Array<{ delay: number; ids: string[] }> = [
  { delay: 3200, ids: ["f5"] },
  { delay: 5000, ids: ["f1", "f2"] },
  { delay: 5800, ids: ["f3"] },
  { delay: 6600, ids: ["f4", "f6"] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [repoInfo] = useState({ owner: "acme", name: "repo-name", branch: "main" });
  const [prInfo, setPrInfo] = useState<PRInfo | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [testingResult, setTestingResult] = useState<TestingResult | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const startReview = (pr: PRInfo) => {
    clearTimers();
    setPrInfo(pr);
    setFindings([]);
    setTestingResult(null);
    setAgents(MOCK_AGENTS.map((a) => ({ ...a, status: "idle", findingsCount: undefined })));
    setReviewStatus("loading_context");

    // Step through review pipeline states
    const stepDelays = [1200, 2400, 3800, 5200, 7200];
    REVIEW_STEPS.forEach((step, i) => {
      const t = setTimeout(() => setReviewStatus(step), stepDelays[i]);
      timers.current.push(t);
    });

    // Agent status transitions
    AGENT_SCHEDULE.forEach(({ delay, updates }) => {
      const t = setTimeout(() => {
        setAgents((prev) =>
          prev.map((a) => {
            const u = updates.find((u) => u.id === a.id);
            return u ? { ...a, ...u } : a;
          })
        );
      }, delay);
      timers.current.push(t);
    });

    // Reveal findings progressively
    FINDING_SCHEDULE.forEach(({ delay, ids }) => {
      const t = setTimeout(() => {
        setFindings((prev) => [
          ...prev,
          ...MOCK_FINDINGS.filter((f) => ids.includes(f.id) && !prev.find((p) => p.id === f.id)),
        ]);
      }, delay);
      timers.current.push(t);
    });

    // ── Testing Agent — fires during the "verifying" step (t = 5200 ms) ──────
    // At this point all other sub-agents have produced their findings.
    // findingsSnapshot captures the findings that will have been revealed by
    // the Finding Schedule by the time the testing delay fires (all findings
    // from MOCK_FINDINGS are revealed by t = 6600 ms; we fire at 6800 ms to
    // ensure everything is available, still within the "verifying" window
    // which ends at t = 7200 ms when "done" fires).
    const testingDelay = 6800;
    const tTest = setTimeout(() => {
      // Use a functional updater to read the current findings without a stale
      // closure, with explicit type annotation to satisfy strict mode.
      setFindings((currentFindings: Finding[]) => {
        testingAgent
          .run({ prInfo: pr, existingFindings: currentFindings })
          .then((result) => {
            setTestingResult(result);
            // Append any new test-agent findings to the shared findings list
            if (result.findings.length > 0) {
              setFindings((prev: Finding[]) => {
                const newIds = new Set(prev.map((f: Finding) => f.id));
                const toAdd = result.findings.filter((f: Finding) => !newIds.has(f.id));
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
              });
            }
          });
        // Return unchanged — this functional update is purely for snapshot read
        return currentFindings;
      });
    }, testingDelay);
    timers.current.push(tTest);
  };

  const isReviewing = reviewStatus !== "idle" && reviewStatus !== "done";

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col">
      <Navbar
        repoOwner={repoInfo.owner}
        repoName={repoInfo.name}
        branch={repoInfo.branch}
        prNumber={prInfo?.number}
      />

      {/* Main content area — full width with chat panel on right */}
      <main className="mr-[280px] mt-14 flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">

          {/* ── Hero / Welcome Section ───────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#e6edf3]">
                {prInfo ? `PR #${prInfo.number} — ${prInfo.title}` : "PR Review Assistant"}
              </h1>
              {reviewStatus === "done" && (
                <div className="flex items-center gap-1.5 text-xs text-[#3fb950] font-medium bg-[#0d2114] border border-[#238636]/40 px-2.5 py-1 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#3fb950]" />
                  Complete
                </div>
              )}
            </div>
            <p className="text-[#8b949e] text-sm leading-relaxed max-w-2xl">
              {prInfo
                ? `${prInfo.author} · ${prInfo.headBranch} → ${prInfo.baseBranch} · ${prInfo.filesChanged} files changed · +${prInfo.additions} −${prInfo.deletions}`
                : "Context-aware GitHub PR review with specialised agents and evidence-backed findings. Enter a PR URL, describe the issue, and optionally run a git diff to get started."}
            </p>
          </div>

          {/* ── Input Section (3 cards) + Review Pipeline ─────────── */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-stretch">
            <PRSubmitCard onSubmit={startReview} isLoading={isReviewing} />
            <div className="flex flex-col gap-4">
              <ReviewProgress status={reviewStatus} />
              {reviewStatus === "idle" && (
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex flex-col flex-1">
                  <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-widest mb-4">How it works</p>
                  <div className="flex flex-col gap-3 flex-1 justify-between">
                    {[
                      { icon: "📥", title: "Context retrieval", desc: "Only the repository context required for the change is fetched." },
                      { icon: "🤖", title: "Specialised agents", desc: "Security, Performance, Test, and more agents activated selectively." },
                      { icon: "🔍", title: "Evidence-backed", desc: "Every finding links to a direct code reference you can verify." },
                      { icon: "🛡️", title: "Safe tooling", desc: "Findings are verified with read-only tooling. PR code is never executed." },
                    ].map((item) => (
                      <div key={item.title} className="flex gap-3 p-3 bg-[#0d1117] border border-[#21262d] rounded-lg">
                        <span className="text-base shrink-0">{item.icon}</span>
                        <div>
                          <p className="text-xs font-semibold text-[#e6edf3] mb-0.5">{item.title}</p>
                          <p className="text-[11px] text-[#8b949e] leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── PR Summary Card ──────────────────────────────────── */}
          {prInfo && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-widest mb-4">PR Summary</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Files changed", value: prInfo.filesChanged },
                  { label: "Additions", value: `+${prInfo.additions}`, color: "text-[#3fb950]" },
                  { label: "Deletions", value: `−${prInfo.deletions}`, color: "text-[#f85149]" },
                  { label: "Author", value: prInfo.author },
                  { label: "Head branch", value: prInfo.headBranch },
                  { label: "Base branch", value: prInfo.baseBranch },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col gap-1">
                    <span className="text-[11px] text-[#8b949e]">{item.label}</span>
                    <span className={`text-sm font-semibold font-mono ${item.color ?? "text-[#e6edf3]"}`}>{item.value}</span>
                  </div>
                ))}
              </div>
              {prInfo.issue && (
                <div className="mt-4 pt-4 border-t border-[#21262d]">
                  <p className="text-[11px] text-[#8b949e] mb-1.5">Issue / Context</p>
                  <p className="text-sm text-[#e6edf3] leading-relaxed">{prInfo.issue}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Agents Section ──────────────────────────────────── */}
          {reviewStatus !== "idle" && (
            <div>
              <AgentPanel agents={agents} />
            </div>
          )}

          {/* ── Findings Section ────────────────────────────────── */}
          {findings.length > 0 && (
            <div>
              <FindingsPanel findings={findings} />
            </div>
          )}

          {/* ── Testing Agent Results ────────────────────────────── */}
          {reviewStatus === "done" && testingResult && (
            <div>
              <TestingPanel result={testingResult} />
            </div>
          )}

          {/* ── Diff Viewer Section ─────────────────────────────── */}
          {prInfo && (
            <div>
              <DiffViewer
                filesChanged={prInfo.filesChanged}
                additions={prInfo.additions}
                deletions={prInfo.deletions}
              />
            </div>
          )}

        </div>
      </main>

      {/* ── Footer — full-width, sits above bottom, adjusts for chat panel ── */}
      <footer className="mr-[280px] border-t border-[#30363d] bg-[#0d1117]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8b949e] font-semibold">PR Review AI</span>
            <span className="text-[10px] bg-[#21262d] border border-[#30363d] rounded px-1.5 py-0.5 text-[#8b949e] font-mono">v1.0.0 beta</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="text-xs text-[#8b949e] hover:text-white transition-colors">Privacy Policy</a>
            <span className="text-[#30363d]">·</span>
            <a href="#" className="text-xs text-[#8b949e] hover:text-white transition-colors">Terms of Service</a>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#3fb950]" />
            <span className="text-xs text-[#8b949e]">All systems operational</span>
          </div>
        </div>
      </footer>

      <ChatPanel repoName={repoInfo.name} />
    </div>
  );
}
