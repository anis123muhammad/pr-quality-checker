/**
 * testingAgent.ts
 *
 * Testing Agent — static analysis module.
 *
 * IMPORTANT: This module performs static / structural analysis only.
 * No test files are actually executed. All results are derived from
 * inspecting PR metadata, file names, diff content, and known patterns.
 * Results are clearly labelled as "static analysis" so consumers can
 * distinguish them from live test execution.
 *
 * Design intent: the public `run()` function accepts a plain data contract
 * (TestingAgentInput) and returns a plain data contract (TestingResult).
 * When a real backend is introduced, the caller in page.tsx only needs to
 * swap the import — the types, UI, and orchestration are unchanged.
 */

import type { Finding, PRInfo } from "@/types";
import type { TestCheck, TestingResult } from "@/types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** All file paths surfaced by existing findings from other agents. */
function collectChangedFiles(findings: Finding[]): string[] {
  const seen = new Set<string>();
  for (const f of findings) {
    if (f.file) seen.add(f.file);
  }
  return Array.from(seen);
}

/** Infer project type from file extensions and known config file names. */
type ProjectType = "react" | "node" | "python" | "unknown";

function detectProjectType(files: string[], prInfo: PRInfo): ProjectType {
  const allFiles = [
    ...files,
    prInfo.headBranch ?? "",
    prInfo.title ?? "",
    prInfo.issue ?? "",
    prInfo.diffCommand ?? "",
  ].join(" ").toLowerCase();

  if (
    allFiles.includes(".tsx") ||
    allFiles.includes(".jsx") ||
    allFiles.includes("react") ||
    allFiles.includes("next")
  ) {
    return "react";
  }
  if (
    allFiles.includes(".py") ||
    allFiles.includes("pytest") ||
    allFiles.includes("requirements") ||
    allFiles.includes("venv")
  ) {
    return "python";
  }
  if (
    allFiles.includes(".ts") ||
    allFiles.includes(".js") ||
    allFiles.includes("package.json") ||
    allFiles.includes("node_modules")
  ) {
    return "node";
  }
  return "unknown";
}

/** Derive the likely test file path for a given source file. */
function inferTestFilePath(sourceFile: string): string | null {
  // Strip leading src/ if present
  const normalized = sourceFile.replace(/^src\//, "");
  const ext = normalized.match(/\.(ts|tsx|js|jsx|py)$/)?.[1];
  if (!ext) return null;

  if (ext === "py") {
    const base = normalized.replace(/\.py$/, "");
    return `tests/${base}_test.py`;
  }
  // JS/TS family
  const base = normalized.replace(/\.(ts|tsx|js|jsx)$/, "");
  return `tests/${base}.test.${ext === "tsx" ? "tsx" : "ts"}`;
}

/** Check whether any existing finding already covers this test file. */
function isAlreadyCovered(testFile: string, findings: Finding[]): boolean {
  return findings.some(
    (f) => f.agentId === "test" && f.file === testFile
  );
}

// ─── Static checks ────────────────────────────────────────────────────────────

function checkCoverageGaps(
  changedFiles: string[],
  existingFindings: Finding[],
  projectType: ProjectType
): TestCheck[] {
  const checks: TestCheck[] = [];

  for (const file of changedFiles) {
    // Skip non-source files
    if (
      file.includes("package.json") ||
      file.includes("tsconfig") ||
      file.includes("requirements") ||
      file.startsWith("tests/") ||
      file.includes(".test.") ||
      file.includes(".spec.")
    ) {
      continue;
    }

    const testFile = inferTestFilePath(file);
    if (!testFile) continue;

    const alreadyFlagged = isAlreadyCovered(testFile, existingFindings);
    const label = `Test coverage: ${file}`;

    if (alreadyFlagged) {
      checks.push({
        id: `cov-exists-${file}`,
        label,
        status: "warning",
        detail: `Partial coverage detected — ${testFile} exists but gaps were identified by the Test Agent.`,
        analysisType: "static",
      });
    } else {
      checks.push({
        id: `cov-gap-${file}`,
        label,
        status: "fail",
        detail: `No test file found at the expected path: ${testFile}. Changed code paths in ${file} are not covered.`,
        analysisType: "static",
      });
    }
  }

  return checks;
}

function checkConfigurationIssues(
  changedFiles: string[],
  projectType: ProjectType
): TestCheck[] {
  const checks: TestCheck[] = [];

  const hasPackageJson = changedFiles.some((f) => f.includes("package.json"));
  const hasTsConfig = changedFiles.some((f) => f.includes("tsconfig"));
  const hasEnvFile = changedFiles.some((f) => f.includes(".env"));
  const hasRequirements = changedFiles.some((f) => f.includes("requirements.txt"));

  if (hasPackageJson) {
    checks.push({
      id: "cfg-package-json",
      label: "package.json modified",
      status: "warning",
      detail:
        "package.json was changed. Verify that dependency changes are reflected in package-lock.json and that no conflicting peer-dependency ranges were introduced.",
      analysisType: "static",
    });
  }

  if (hasTsConfig) {
    checks.push({
      id: "cfg-tsconfig",
      label: "tsconfig.json modified",
      status: "warning",
      detail:
        "tsconfig.json was changed. Confirm that compiler options (strict, moduleResolution, paths) remain consistent with the project's build pipeline.",
      analysisType: "static",
    });
  }

  if (hasEnvFile) {
    checks.push({
      id: "cfg-env",
      label: ".env file modified",
      status: "fail",
      detail:
        ".env file changes detected. Environment variable modifications may break runtime configuration. Ensure all consumers of changed variables are updated and that secrets are not committed.",
      analysisType: "static",
    });
  }

  if (hasRequirements && projectType === "python") {
    checks.push({
      id: "cfg-requirements",
      label: "requirements.txt modified",
      status: "warning",
      detail:
        "Python dependencies changed. Verify the virtual environment is rebuilt and that version pins do not conflict.",
      analysisType: "static",
    });
  }

  return checks;
}

function checkProjectSetup(projectType: ProjectType, changedFiles: string[]): TestCheck[] {
  const checks: TestCheck[] = [];

  if (projectType === "react") {
    const hasHookFiles = changedFiles.some(
      (f) => f.endsWith(".tsx") || f.endsWith(".jsx")
    );
    if (hasHookFiles) {
      checks.push({
        id: "react-hooks-rule",
        label: "React component files changed",
        status: "info",
        detail:
          "Changed .tsx/.jsx files should be verified against the Rules of Hooks: hooks must not be called conditionally or inside loops. No automated hook-order check is performed here.",
        analysisType: "static",
      });
    }
  }

  if (projectType === "python") {
    checks.push({
      id: "python-venv",
      label: "Python virtual environment",
      status: "info",
      detail:
        "Ensure the virtual environment is activated before running tests (python -m pytest). If CI runs are used, confirm the environment matrix covers the target Python version.",
      analysisType: "static",
    });
  }

  return checks;
}

// ─── Finding builder ──────────────────────────────────────────────────────────

function checksToFindings(checks: TestCheck[], startId: number): Finding[] {
  return checks
    .filter((c) => c.status === "fail" || c.status === "warning")
    .map((c, i): Finding => ({
      id: `t-agent-${startId + i}`,
      agentId: "test",
      agentName: "Test Agent",
      severity:
        c.status === "fail"
          ? "high"
          : c.id.startsWith("cfg-env")
          ? "high"
          : "medium",
      title: c.label,
      description: c.detail,
      file: deriveFileFromCheck(c),
      evidence: buildEvidence(c),
      evidenceType: c.id.startsWith("cov-") ? "test" : "config",
      remediation: buildRemediation(c),
    }));
}

function deriveFileFromCheck(c: TestCheck): string {
  // Coverage gap IDs encode the source file after "cov-gap-" or "cov-exists-"
  if (c.id.startsWith("cov-gap-"))    return c.id.replace("cov-gap-", "");
  if (c.id.startsWith("cov-exists-")) return c.id.replace("cov-exists-", "");
  if (c.id === "cfg-package-json") return "package.json";
  if (c.id === "cfg-tsconfig")     return "tsconfig.json";
  if (c.id === "cfg-env")          return ".env";
  if (c.id === "cfg-requirements") return "requirements.txt";
  return "unknown";
}

function buildEvidence(c: TestCheck): string {
  if (c.id.startsWith("cov-gap-")) {
    const src = c.id.replace("cov-gap-", "");
    const testPath = inferTestFilePath(src) ?? "<no test path>";
    return `// Changed file: ${src}\n// Expected test file: ${testPath}\n// Static analysis: file not found in known test locations`;
  }
  if (c.id.startsWith("cov-exists-")) {
    const src = c.id.replace("cov-exists-", "");
    const testPath = inferTestFilePath(src) ?? "<no test path>";
    return `// Changed file: ${src}\n// Test file: ${testPath}\n// Status: partial coverage — gaps reported by Test Agent`;
  }
  return `// Static analysis check: ${c.label}\n// Detail: ${c.detail}`;
}

function buildRemediation(c: TestCheck): string | undefined {
  if (c.id.startsWith("cov-gap-")) {
    const src = c.id.replace("cov-gap-", "");
    const testPath = inferTestFilePath(src) ?? "<path>";
    return `Create ${testPath} and add unit tests covering the changed code paths in ${src}.`;
  }
  if (c.id === "cfg-package-json") {
    return "Run `npm install` to regenerate package-lock.json and review peer-dependency warnings.";
  }
  if (c.id === "cfg-env") {
    return "Audit all env variable usages, update .env.example, and ensure secrets are not tracked by git.";
  }
  return undefined;
}

// ─── Public contract ──────────────────────────────────────────────────────────

export interface TestingAgentInput {
  prInfo: PRInfo;
  /** Findings already collected by other agents. */
  existingFindings: Finding[];
}

/**
 * run()
 *
 * Executes the Testing Agent static analysis and returns a structured result.
 *
 * This is intentionally async so that swapping to a real API call requires
 * only changing this function body — the call site in page.tsx and all
 * downstream types remain identical.
 */
export async function run(input: TestingAgentInput): Promise<TestingResult> {
  const { prInfo, existingFindings } = input;

  const changedFiles = collectChangedFiles(existingFindings);
  const projectType = detectProjectType(changedFiles, prInfo);

  const coverageChecks  = checkCoverageGaps(changedFiles, existingFindings, projectType);
  const configChecks    = checkConfigurationIssues(changedFiles, projectType);
  const setupChecks     = checkProjectSetup(projectType, changedFiles);

  const allChecks: TestCheck[] = [...coverageChecks, ...configChecks, ...setupChecks];

  // Derive new Finding[] from the checks (fails and warnings only)
  const newFindings = checksToFindings(allChecks, existingFindings.length + 1);

  const passCount    = allChecks.filter((c) => c.status === "pass").length;
  const warnCount    = allChecks.filter((c) => c.status === "warning").length;
  const failCount    = allChecks.filter((c) => c.status === "fail").length;
  const infoCount    = allChecks.filter((c) => c.status === "info").length;

  const passed = failCount === 0;

  const summary = passed
    ? `Static analysis complete. ${allChecks.length} check${allChecks.length !== 1 ? "s" : ""} performed — ${warnCount} warning${warnCount !== 1 ? "s" : ""}, ${infoCount} informational note${infoCount !== 1 ? "s" : ""}. No critical coverage gaps or configuration issues detected.`
    : `Static analysis complete. ${failCount} issue${failCount !== 1 ? "s" : ""} require attention: coverage gaps or configuration problems were found across ${changedFiles.length} changed file${changedFiles.length !== 1 ? "s" : ""}. ${warnCount} warning${warnCount !== 1 ? "s" : ""} also noted.`;

  return {
    analysisMode: "static",
    projectType,
    checkedFiles: changedFiles,
    checks: allChecks,
    findings: newFindings,
    passed,
    summary,
    stats: { pass: passCount, warn: warnCount, fail: failCount, info: infoCount },
  };
}
