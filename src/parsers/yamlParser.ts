import { dedupeSortedSegments, trimAndFilterSegment, type TextSegment } from "./jsonParser";

function lineStartIndices(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function indentLen(line: string): number {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].length : 0;
}

/** Remove `#` comments (best-effort; does not parse YAML strings). */
function stripLineComment(line: string): string {
  const idx = line.indexOf("#");
  if (idx === -1) return line;
  return line.slice(0, idx);
}

function skipWsIndex(line: string, from: number): number {
  let j = from;
  while (j < line.length && /\s/.test(line[j])) j++;
  return j;
}

/** True when `run:` is followed only by a YAML block scalar header (`|`, `>`, optional modifiers). */
function isBlockScalarHeader(afterRun: string): boolean {
  const t = afterRun.trim();
  if (!t) return true;
  if (t[0] !== "|" && t[0] !== ">") return false;
  return /^[|>](?:\d*|[+\-])*$/.test(t);
}

/**
 * GitHub Actions style: `run:` or list item `- run:` at line start (after whitespace).
 * Does not match keys like `override-run:` because `run:` must appear right after optional `- `.
 */
const RUN_LINE = /^\s*(?:-\s+)?run:\s*(.*)$/;

/**
 * Extract bodies of `run:` steps only (no other keys, no global regex pass).
 */
export function extractYamlRunSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const lines = text.split(/\n/);
  const starts = lineStartIndices(text);

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const logical = stripLineComment(raw);
    const m = RUN_LINE.exec(logical);
    if (!m) continue;

    const lineGlobalStart = starts[li];
    const indent = indentLen(raw);
    const afterRun = m[1] ?? "";

    const runIdx = logical.indexOf("run:");
    if (runIdx === -1) continue;
    const cmdStartInLine = skipWsIndex(logical, runIdx + "run:".length);
    const cmdStartGlobal = lineGlobalStart + cmdStartInLine;

    if (isBlockScalarHeader(afterRun)) {
      let bodyStartLine = li + 1;
      while (bodyStartLine < lines.length) {
        const t = stripLineComment(lines[bodyStartLine]);
        if (t.trim().length > 0) break;
        bodyStartLine++;
      }
      if (bodyStartLine >= lines.length) continue;

      if (indentLen(lines[bodyStartLine]) <= indent) continue;

      let endLine = bodyStartLine;
      for (let j = bodyStartLine + 1; j < lines.length; j++) {
        const t = stripLineComment(lines[j]);
        if (t.trim() === "") {
          endLine = j;
          continue;
        }
        if (indentLen(lines[j]) <= indent) break;
        endLine = j;
      }

      const start = starts[bodyStartLine] + indentLen(lines[bodyStartLine]);
      const end = starts[endLine] + lines[endLine].length;
      const content = text.slice(start, end);
      segments.push({ start, end, content });
      li = endLine;
      continue;
    }

    const slice = text.slice(cmdStartGlobal, lineGlobalStart + logical.length);
    const trimmed = slice.trim();
    if (trimmed.length === 0) continue;

    const lead = slice.length - slice.trimStart().length;
    const trail = slice.length - slice.trimEnd().length;
    const start = cmdStartGlobal + lead;
    const end = cmdStartGlobal + slice.length - trail;
    const content = text.slice(start, end);

    segments.push({ start, end, content });
  }

  const normalized: TextSegment[] = [];
  for (const s of segments) {
    const n = trimAndFilterSegment(s);
    if (n) normalized.push(n);
  }
  normalized.sort((a, b) => a.start - b.start);
  return dedupeSortedSegments(normalized);
}
