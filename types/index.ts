export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  time: string;
}

export interface RepoInfo {
  url: string;
  owner: string;
  name: string;
  branch: string;
  connected: boolean;
}

export interface DiffResult {
  raw: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "remove" | "context" | "header" | "meta";
  content: string;
}

export type AgentStatus = "idle" | "activating" | "running" | "done" | "skipped";

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  findingsCount?: number;
  icon: "security" | "performance" | "style" | "test" | "dependency" | "context";
}

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  agentId: string;
  agentName: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  file: string;
  line?: number;
  evidence: string;
  evidenceType: "code" | "caller" | "test" | "config" | "dependency";
  remediation?: string;
}

export interface PRInfo {
  number: number;
  title: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  description?: string;
  url?: string;
  issue?: string;
  diffCommand?: string;
}

export type ReviewStatus = "idle" | "loading_context" | "activating_agents" | "reviewing" | "verifying" | "done";

// ─── Testing Agent types ──────────────────────────────────────────────────────

/**
 * A single check performed by the Testing Agent.
 * analysisType distinguishes static (no execution) from live (actual run).
 */
export interface TestCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail" | "info";
  detail: string;
  /** "static" = structural/pattern analysis only; "executed" = real test run */
  analysisType: "static" | "executed";
}

/**
 * Structured result returned by testingAgent.run().
 * Designed as a plain data contract so the call site and UI are unchanged
 * when the underlying execution strategy (mock → real backend) changes.
 */
export interface TestingResult {
  /** How the analysis was performed */
  analysisMode: "static" | "executed";
  /** Detected project type */
  projectType: "react" | "node" | "python" | "unknown";
  /** Source files that were inspected */
  checkedFiles: string[];
  /** Individual checks performed */
  checks: TestCheck[];
  /** New Finding[] entries to surface alongside other agent findings */
  findings: Finding[];
  /** True if no failing checks were found */
  passed: boolean;
  /** Human-readable one-line summary for display */
  summary: string;
  /** Aggregate counts */
  stats: { pass: number; warn: number; fail: number; info: number };
}
