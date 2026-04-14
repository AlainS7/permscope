import type { RiskLevel, RiskRule } from "./rules";
import { rules } from "./rules";

export interface RiskMatch {
  start: number;
  end: number;
  risk: RiskLevel;
  description: string;
  why: string[];
  edgeCases: string[];
  recommendation: string;
  /** Short after-range hint for HIGH (from rule when set). */
  inlineHint?: string;
  /** One-line text for Problems panel only; see {@link RiskRule.diagnosticSummary}. */
  diagnosticSummary: string;
}

/** Segment extracted by parsers; ranges are absolute in the document. */
export interface AnalyzableSegment {
  start: number;
  content: string;
}

/**
 * Normalize command text before any rule runs: unwrap `Bash(...)`, strip one layer of wrapping
 * quotes, trim. Repeats until stable so `"Bash(pytest …)"` becomes the inner command.
 */
export function normalizeCommand(cmd: string): string {
  let s = cmd.trim();
  for (let i = 0; i < 10; i++) {
    const prev = s;
    s = s
      .replace(/^Bash\((.*)\)$/i, "$1")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (s === prev) break;
  }
  return s;
}

function severity(r: RiskLevel): number {
  if (r === "high") return 3;
  if (r === "medium") return 2;
  return 1;
}

/** Match against {@link normalized}; use a new RegExp so global rules do not mutate `lastIndex`. */
function ruleMatchesNormalized(rule: RiskRule, normalized: string): boolean {
  const re = new RegExp(rule.pattern.source, rule.pattern.flags);
  return re.test(normalized);
}

/**
 * Evaluate all rules on {@link normalizeCommand normalized} text. At most one {@link RiskMatch}
 * is returned, spanning the original segment `[start, start + content.length)`. Ties use the first
 * matching rule in {@link rules} order.
 */
export function analyzeText(content: string, start: number): RiskMatch[] {
  const normalized = normalizeCommand(content);
  const end = start + content.length;

  let best: RiskMatch | null = null;

  for (const rule of rules) {
    if (!ruleMatchesNormalized(rule, normalized)) continue;
    if (!best || severity(rule.risk) > severity(best.risk)) {
      best = {
        start,
        end,
        risk: rule.risk,
        description: rule.description,
        why: rule.why,
        edgeCases: rule.edgeCases,
        recommendation: rule.recommendation,
        inlineHint: rule.inlineHint,
        diagnosticSummary: rule.diagnosticSummary,
      };
    }
  }

  return best ? [best] : [];
}

/**
 * @see {@link analyzeText}
 */
export function analyzeSegment(segment: AnalyzableSegment): RiskMatch[] {
  return analyzeText(segment.content, segment.start);
}

/**
 * Merge overlapping spans for decoration so the strongest risk wins visually.
 */
export function mergeMatchesForDecoration(matches: RiskMatch[]): Array<{ start: number; end: number; risk: RiskLevel }> {
  if (matches.length === 0) return [];

  const points = new Set<number>();
  for (const m of matches) {
    points.add(m.start);
    points.add(m.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: Array<{ start: number; end: number; risk: RiskLevel }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === b) continue;

    let best: RiskLevel | null = null;
    for (const m of matches) {
      if (m.start < b && m.end > a) {
        if (!best || severity(m.risk) > severity(best)) best = m.risk;
      }
    }
    if (best) out.push({ start: a, end: b, risk: best });
  }

  return out;
}
