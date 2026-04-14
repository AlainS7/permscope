import * as vscode from "vscode";
import type { RiskLevel } from "../analyzer/rules";
import { mergeMatchesForDecoration, type RiskMatch } from "../analyzer/riskEngine";

const RANGE_BEHAVIOR = vscode.DecorationRangeBehavior.ClosedClosed;

const HIGH_RISK_STYLE: vscode.DecorationRenderOptions = {
  backgroundColor: "rgba(255, 0, 0, 0.25)",
  rangeBehavior: RANGE_BEHAVIOR,
};

const MEDIUM_RISK_STYLE: vscode.DecorationRenderOptions = {
  backgroundColor: "rgba(255, 200, 0, 0.20)",
  rangeBehavior: RANGE_BEHAVIOR,
};

const LOW_RISK_STYLE: vscode.DecorationRenderOptions = {
  backgroundColor: "rgba(0, 200, 0, 0.15)",
  rangeBehavior: RANGE_BEHAVIOR,
};

/**
 * Inline hint after HIGH matches. Anchor is a zero-width range so `after` attaches after the
 * segment; for JSON string values, the anchor moves past the closing `"` when it sits at {@link RiskMatch.end}.
 */
const HIGH_INLINE_HINT: vscode.DecorationRenderOptions = {
  rangeBehavior: RANGE_BEHAVIOR,
  after: {
    color: "rgba(200,200,200,0.7)",
    margin: "0 0 0 4px",
    fontWeight: "400",
    fontStyle: "normal",
    textDecoration: "none",
  },
};

/** Skip hints on very long lines to reduce clutter. */
const MAX_LINE_LENGTH_FOR_HIGH_HINT = 100;

/** Max characters for the hint body (one line). */
const MAX_HIGH_HINT_CHARS = 48;

/** First clause of description, trimmed for a single-line after hint (fallback when rule has no inlineHint). */
function shortHighDescriptionHint(description: string): string {
  const first = description.split(/[.;]/)[0]?.trim() ?? "";
  if (!first) return "";
  if (first.length <= MAX_HIGH_HINT_CHARS) return first;
  return `${first.slice(0, MAX_HIGH_HINT_CHARS - 1).trimEnd()}…`;
}

function highHintBody(m: RiskMatch): string {
  const raw = m.inlineHint?.trim() ?? "";
  if (raw) {
    return raw.length <= MAX_HIGH_HINT_CHARS ? raw : `${raw.slice(0, MAX_HIGH_HINT_CHARS - 1).trimEnd()}…`;
  }
  return shortHighDescriptionHint(m.description);
}

/** Leading spaces before arrow for separation from the matched command. */
const HIGH_HINT_AFTER_PREFIX = "    ← ";

const CHAR_DOUBLE_QUOTE = 34;

/**
 * {@link RiskMatch.end} is exclusive: for JSON script/allow values it often equals the closing `"`.
 * Place the hint anchor after that quote so the hint is not drawn inside the literal.
 */
function highHintAnchorOffset(text: string, m: RiskMatch): number {
  if (m.end < text.length && text.charCodeAt(m.end) === CHAR_DOUBLE_QUOTE) {
    return m.end + 1;
  }
  return m.end;
}

function highHintDecorationOptions(anchor: vscode.Range, hintBody: string): vscode.DecorationOptions {
  return {
    range: anchor,
    renderOptions: {
      after: {
        contentText: `${HIGH_HINT_AFTER_PREFIX}${hintBody}`,
        color: "rgba(200,200,200,0.7)",
        margin: "0 0 0 4px",
        fontWeight: "400",
        fontStyle: "normal",
        textDecoration: "none",
      },
    },
  };
}

/**
 * One HIGH hint per line only; skip long lines and lines with multiple HIGH matches.
 */
function buildHighRiskInlineHints(doc: vscode.TextDocument, matches: RiskMatch[]): vscode.DecorationOptions[] {
  const fullText = doc.getText();
  const highs = matches.filter((m) => m.risk === "high");
  const byLine = new Map<number, RiskMatch[]>();
  for (const m of highs) {
    const line = doc.positionAt(m.start).line;
    const list = byLine.get(line) ?? [];
    list.push(m);
    byLine.set(line, list);
  }

  const out: vscode.DecorationOptions[] = [];
  for (const [, list] of byLine) {
    if (list.length !== 1) continue;
    const m = list[0];
    const line = doc.positionAt(m.start).line;
    if (doc.lineAt(line).text.length > MAX_LINE_LENGTH_FOR_HIGH_HINT) continue;
    const body = highHintBody(m);
    if (!body) continue;
    const off = highHintAnchorOffset(fullText, m);
    const endPos = doc.positionAt(Math.min(off, fullText.length));
    const anchor = new vscode.Range(endPos, endPos);
    out.push(highHintDecorationOptions(anchor, body));
  }
  return out;
}

/**
 * Owns risk highlights and HIGH inline hints.
 * Types are long-lived; each refresh only updates ranges / instance content.
 */
export class DecorationController implements vscode.Disposable {
  /** Created once per controller instance; only ranges change on {@link apply}. */
  private readonly highRiskDecoration = vscode.window.createTextEditorDecorationType(HIGH_RISK_STYLE);

  private readonly mediumRiskDecoration = vscode.window.createTextEditorDecorationType(MEDIUM_RISK_STYLE);

  private readonly lowRiskDecoration = vscode.window.createTextEditorDecorationType(LOW_RISK_STYLE);

  private readonly highInlineHintDecoration = vscode.window.createTextEditorDecorationType(HIGH_INLINE_HINT);

  apply(editor: vscode.TextEditor, matches: RiskMatch[]): void {
    const merged = mergeMatchesForDecoration(matches);
    const byRisk: Record<RiskLevel, vscode.Range[]> = {
      high: [],
      medium: [],
      low: [],
    };

    const doc = editor.document;
    for (const m of merged) {
      const range = new vscode.Range(doc.positionAt(m.start), doc.positionAt(m.end));
      byRisk[m.risk].push(range);
    }

    editor.setDecorations(this.highRiskDecoration, byRisk.high);
    editor.setDecorations(this.mediumRiskDecoration, byRisk.medium);
    editor.setDecorations(this.lowRiskDecoration, byRisk.low);

    editor.setDecorations(this.highInlineHintDecoration, buildHighRiskInlineHints(doc, matches));
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.highRiskDecoration, []);
    editor.setDecorations(this.mediumRiskDecoration, []);
    editor.setDecorations(this.lowRiskDecoration, []);
    editor.setDecorations(this.highInlineHintDecoration, []);
  }

  dispose(): void {
    this.highRiskDecoration.dispose();
    this.mediumRiskDecoration.dispose();
    this.lowRiskDecoration.dispose();
    this.highInlineHintDecoration.dispose();
  }
}
