import * as vscode from "vscode";
import type { RiskMatch } from "../analyzer/riskEngine";
import { formatHoverBullets } from "../copy/hoverBulletFormat";

/** High/medium have Problems entries; hover omits duplicate severity branding. */
function matchHasDiagnostic(m: RiskMatch): boolean {
  return m.risk === "high" || m.risk === "medium";
}

/** Single-line prose for hover so the viewer does not break mid-word awkwardly. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function appendSectionRule(md: vscode.MarkdownString): void {
  md.appendMarkdown("\n\n---\n\n");
}

/** One `-` per idea; long text is a single line so the hover panel wraps to card width. */
function appendBulletList(md: vscode.MarkdownString, items: string[]): void {
  for (const t of items) {
    md.appendMarkdown("- ");
    md.appendText(t);
    md.appendMarkdown("\n");
  }
}

/**
 * High/medium: explanation only (Problems already shows severity + PermScope source).
 * Low: severity line + full sections including “When it could be risky”.
 */
function appendFinding(md: vscode.MarkdownString, m: RiskMatch): void {
  const description = oneLine(m.description);
  const recommendation = oneLine(m.recommendation);
  const whyItems = formatHoverBullets(m.why);
  const edgeItems = formatHoverBullets(m.edgeCases);
  const diagnostic = matchHasDiagnostic(m);

  if (!diagnostic) {
    md.appendMarkdown("$(check) **LOW RISK**\n\n");
  }

  md.appendMarkdown("**What this does:**\n\n");
  md.appendText(description);

  if (whyItems.length > 0) {
    appendSectionRule(md);
    md.appendMarkdown("**Why it matters:**\n\n");
    appendBulletList(md, whyItems);
  }

  if (!diagnostic && edgeItems.length > 0) {
    appendSectionRule(md);
    md.appendMarkdown("**When it could be risky:**\n\n");
    appendBulletList(md, edgeItems);
  }

  appendSectionRule(md);
  md.appendMarkdown("**Recommendation:**\n\n");
  md.appendText(recommendation);
}

function isOffsetInsideMatch(offset: number, m: RiskMatch): boolean {
  return offset >= m.start && offset < m.end;
}

export class PermScopeHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly getMatches: (doc: vscode.TextDocument) => RiskMatch[],
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    const offset = document.offsetAt(position);
    const matches = this.getMatches(document).filter((m) =>
      isOffsetInsideMatch(offset, m),
    );
    if (matches.length === 0) {
      return null;
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportHtml = false;
    md.supportThemeIcons = true;

    const showPermScopeHeader = matches.some((m) => !matchHasDiagnostic(m));
    if (showPermScopeHeader) {
      md.appendMarkdown("### PermScope\n\n");
    }

    for (let i = 0; i < matches.length; i++) {
      if (i > 0) {
        md.appendMarkdown("\n\n---\n\n");
      }
      appendFinding(md, matches[i]);
    }

    let hoverRange = new vscode.Range(
      document.positionAt(matches[0].start),
      document.positionAt(matches[0].end),
    );
    for (let i = 1; i < matches.length; i++) {
      hoverRange = hoverRange.union(
        new vscode.Range(
          document.positionAt(matches[i].start),
          document.positionAt(matches[i].end),
        ),
      );
    }

    return new vscode.Hover(md, hoverRange);
  }
}
