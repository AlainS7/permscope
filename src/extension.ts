import * as vscode from "vscode";
import { analyzeText, type RiskMatch } from "./analyzer/riskEngine";
import type { RiskLevel } from "./analyzer/rules";
import { extractJsonCommandSegments } from "./parsers/jsonParser";
import { extractYamlRunSegments } from "./parsers/yamlParser";
import { DecorationController } from "./providers/decorationProvider";
import { riskMatchesToDiagnostics } from "./diagnostics/permscopeDiagnostics";
import { PermScopeHoverProvider } from "./providers/hoverProvider";

const supported = new Set(["json", "jsonc", "yaml"]);

const isSupportedDoc = (doc: vscode.TextDocument): boolean => supported.has(doc.languageId);

function countByRisk(matches: RiskMatch[]): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0 };
  for (const m of matches) {
    counts[m.risk]++;
  }
  return counts;
}

/** Status bar foreground when any HIGH is present. */
const STATUS_COLOR_HIGH = "#ff4d4f";
/** Status bar foreground when any MEDIUM (and no HIGH). */
const STATUS_COLOR_MEDIUM = "#faad14";
/** Status bar foreground when only LOW (or unexpected empty counts). */
const STATUS_COLOR_LOW_ONLY = "#52c41a";

function severityStatusColor(c: Record<RiskLevel, number>): string {
  if (c.high > 0) return STATUS_COLOR_HIGH;
  if (c.medium > 0) return STATUS_COLOR_MEDIUM;
  return STATUS_COLOR_LOW_ONLY;
}

/** Full count line for status bar tooltip. */
function formatRiskCountBreakdown(c: Record<RiskLevel, number>): string {
  return `PermScope: ${c.high} High | ${c.medium} Medium | ${c.low} Low`;
}

/**
 * Short status label with codicons (not emoji): error / warning / check by worst severity present.
 */
function formatRiskStatusBarPrimaryText(c: Record<RiskLevel, number>): string {
  if (c.high > 0) {
    return `$(error) High Risk Detected (${c.high})`;
  }
  if (c.medium > 0) {
    return `$(warning) Medium Risk (${c.medium})`;
  }
  if (c.low > 0) {
    return `$(check) Low Risk Only`;
  }
  return "";
}

function collectMatches(document: vscode.TextDocument): RiskMatch[] {
  const text = document.getText();
  const lang = document.languageId;

  let segments: { start: number; end: number; content: string }[] = [];

  if (lang === "json" || lang === "jsonc") {
    segments = extractJsonCommandSegments(text, document.uri.fsPath);
  } else if (lang === "yaml") {
    segments = extractYamlRunSegments(text);
  }

  const out: RiskMatch[] = [];

  for (const s of segments) {
    out.push(...analyzeText(s.content, s.start));
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}

export function activate(context: vscode.ExtensionContext): void {
  const matchesByDoc = new Map<string, RiskMatch[]>();
  const decorations = new DecorationController();
  const permscopeDiagnostics = vscode.languages.createDiagnosticCollection("permscope");

  const riskStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  riskStatusBar.name = "PermScope";
  riskStatusBar.command = "permscope.showRiskSummary";

  const updateRiskStatusBar = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSupportedDoc(editor.document)) {
      riskStatusBar.command = undefined;
      riskStatusBar.hide();
      return;
    }
    const matches = matchesByDoc.get(editor.document.uri.toString()) ?? [];
    if (matches.length === 0) {
      riskStatusBar.command = undefined;
      riskStatusBar.hide();
      return;
    }
    const c = countByRisk(matches);
    riskStatusBar.text = formatRiskStatusBarPrimaryText(c);
    riskStatusBar.color = severityStatusColor(c);
    riskStatusBar.tooltip = formatRiskCountBreakdown(c);
    riskStatusBar.command = c.high > 0 || c.medium > 0 ? "permscope.showRiskSummary" : undefined;
    riskStatusBar.show();
  };

  const syncDiagnostics = (doc: vscode.TextDocument): void => {
    const matches = matchesByDoc.get(doc.uri.toString()) ?? [];
    const diags = riskMatchesToDiagnostics(doc, matches);
    if (diags.length === 0) {
      permscopeDiagnostics.delete(doc.uri);
      return;
    }
    permscopeDiagnostics.set(doc.uri, diags);
  };

  const analyzeAndStore = (doc: vscode.TextDocument): void => {
    if (!supported.has(doc.languageId)) {
      matchesByDoc.delete(doc.uri.toString());
      permscopeDiagnostics.delete(doc.uri);
      return;
    }

    matchesByDoc.set(doc.uri.toString(), collectMatches(doc));
    syncDiagnostics(doc);
  };

  const refreshEditor = (editor: vscode.TextEditor | undefined): void => {
    if (!editor) {
      updateRiskStatusBar();
      return;
    }

    if (!supported.has(editor.document.languageId)) {
      decorations.clear(editor);
      updateRiskStatusBar();
      return;
    }

    analyzeAndStore(editor.document);

    const key = editor.document.uri.toString();
    const matches = matchesByDoc.get(key) ?? [];

    decorations.apply(editor, matches);
    updateRiskStatusBar();
  };

  for (const doc of vscode.workspace.textDocuments) {
    if (supported.has(doc.languageId)) {
      analyzeAndStore(doc);
    }
  }

  const langSelector: vscode.DocumentSelector = [
    { language: "json" },
    { language: "jsonc" },
    { language: "yaml" },
  ];

  const hover = vscode.languages.registerHoverProvider(
    langSelector,
    new PermScopeHoverProvider((doc) => matchesByDoc.get(doc.uri.toString()) ?? []),
  );

  const openProblemsFromStatusCmd = vscode.commands.registerCommand("permscope.showRiskSummary", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSupportedDoc(editor.document)) return;
    const matches = matchesByDoc.get(editor.document.uri.toString()) ?? [];
    const diags = riskMatchesToDiagnostics(editor.document, matches);
    if (diags.length === 0) return;
    await vscode.commands.executeCommand("workbench.actions.view.problems");
  });

  context.subscriptions.push(
    hover,
    openProblemsFromStatusCmd,
    decorations,
    permscopeDiagnostics,
    riskStatusBar,
    vscode.window.onDidChangeActiveTextEditor((e) => {
      refreshEditor(e);
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      analyzeAndStore(doc);
      if (vscode.window.activeTextEditor?.document === doc) {
        refreshEditor(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      analyzeAndStore(e.document);
      const ed = vscode.window.activeTextEditor;
      if (ed && ed.document === e.document && supported.has(e.document.languageId)) {
        decorations.apply(ed, matchesByDoc.get(e.document.uri.toString()) ?? []);
      }
      updateRiskStatusBar();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      analyzeAndStore(doc);
      if (vscode.window.activeTextEditor?.document === doc) {
        refreshEditor(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      matchesByDoc.delete(doc.uri.toString());
      permscopeDiagnostics.delete(doc.uri);
    }),
  );

  refreshEditor(vscode.window.activeTextEditor);
}

export function deactivate(): void {}
