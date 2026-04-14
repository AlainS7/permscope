import * as vscode from "vscode";
import type { RiskMatch } from "../analyzer/riskEngine";

/** Max characters after `HIGH RISK: ` / `MEDIUM RISK: ` (summary only; hover stays detailed). */
const MAX_SUMMARY_LEN = 72;

function diagnosticSeverity(risk: "high" | "medium"): vscode.DiagnosticSeverity {
  return risk === "high" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
}

function isHighOrMedium(m: RiskMatch): m is RiskMatch & { risk: "high" | "medium" } {
  return m.risk === "high" || m.risk === "medium";
}

/**
 * Exactly one Problems line: `HIGH RISK: Executes arbitrary code` (no newlines).
 */
export function formatDiagnosticMessage(m: RiskMatch & { risk: "high" | "medium" }): string {
  const level = m.risk.toUpperCase();
  let summary = m.diagnosticSummary.replace(/\s+/g, " ").trim();
  if (summary.length > MAX_SUMMARY_LEN) {
    summary = `${summary.slice(0, MAX_SUMMARY_LEN - 1)}…`;
  }
  return `${level} RISK: ${summary}`;
}

/** Problems entries for **high** and **medium** only; low stays in editor highlights and hovers. */
export function riskMatchesToDiagnostics(doc: vscode.TextDocument, matches: RiskMatch[]): vscode.Diagnostic[] {
  return matches.filter(isHighOrMedium).map((m) => {
    const range = new vscode.Range(doc.positionAt(m.start), doc.positionAt(m.end));
    const diagnostic = new vscode.Diagnostic(range, formatDiagnosticMessage(m), diagnosticSeverity(m.risk));
    diagnostic.source = "PermScope";
    return diagnostic;
  });
}
