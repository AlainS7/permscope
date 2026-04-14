import * as path from "node:path";

export interface TextSegment {
  /** Inclusive start offset in the document */
  start: number;
  /** Exclusive end offset in the document */
  end: number;
  /** Same as document slice [start, end) after trimming for analysis */
  content: string;
}

/** Skip only empty / whitespace-only segments (keep short scripts like `ls`). */
const MIN_SEGMENT_CHARS = 1;

const isWs = (c: string) => /\s/.test(c);

function skipWs(text: string, i: number): number {
  let j = i;
  while (j < text.length && isWs(text[j])) j++;
  return j;
}

function skipBom(text: string, i: number): number {
  if (text.charCodeAt(i) === 0xfeff) return i + 1;
  return i;
}

/** Read a JSON string starting at opening `"` at index `i`. */
function readJsonString(text: string, i: number): { valueStart: number; valueEnd: number; end: number } | null {
  if (text[i] !== '"') return null;
  const valueStart = i + 1;
  let j = valueStart;
  while (j < text.length) {
    const c = text[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === '"') {
      return { valueStart, valueEnd: j, end: j + 1 };
    }
    j++;
  }
  return null;
}

function findMatchingBrace(text: string, openBraceIdx: number): number | null {
  if (text[openBraceIdx] !== "{") return null;
  let depth = 0;
  for (let i = openBraceIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const s = readJsonString(text, i);
      if (!s) return null;
      i = s.end - 1;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function findMatchingBracket(text: string, openIdx: number): number | null {
  if (text[openIdx] !== "[") return null;
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const s = readJsonString(text, i);
      if (!s) return null;
      i = s.end - 1;
      continue;
    }
    if (c === "[") depth++;
    if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

function skipJsonValue(text: string, start: number): number {
  let i = skipWs(text, start);
  if (i >= text.length) return text.length;
  const c = text[i];
  if (c === '"') {
    const s = readJsonString(text, i);
    return s ? s.end : text.length;
  }
  if (c === "{") {
    const e = findMatchingBrace(text, i);
    return e !== null ? e + 1 : text.length;
  }
  if (c === "[") {
    const e = findMatchingBracket(text, i);
    return e !== null ? e + 1 : text.length;
  }

  const tail = text.slice(i);
  const kw = tail.match(/^(true|false|null)\b/);
  if (kw) return i + kw[1].length;

  const num = tail.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (num && num[0].length > 0) return i + num[0].length;

  return i + 1;
}

/** Skip line (`//`) and block (`slash-star`) comments before the root object (JSONC-style package.json). */
function skipJsonCLeadingTrivia(text: string, i: number): number {
  let j = i;
  while (j < text.length) {
    j = skipWs(text, j);
    if (j >= text.length) break;
    if (text[j] === "/" && text[j + 1] === "/") {
      j += 2;
      while (j < text.length && text[j] !== "\n" && text[j] !== "\r") j++;
      continue;
    }
    if (text[j] === "/" && text[j + 1] === "*") {
      j += 2;
      const end = text.indexOf("*/", j);
      j = end === -1 ? text.length : end + 2;
      continue;
    }
    break;
  }
  return j;
}

function getRootObjectBounds(text: string): { open: number; close: number } | null {
  let i = skipWs(text, 0);
  i = skipBom(text, i);
  i = skipJsonCLeadingTrivia(text, i);
  if (i >= text.length || text[i] !== "{") return null;
  const close = findMatchingBrace(text, i);
  if (close === null) return null;
  return { open: i, close };
}

/** Locate the scripts object when root parse fails: first scripts key plus opening brace in the file. */
function extractScriptsByKeyScan(text: string): TextSegment[] {
  const re = /"scripts"\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const braceIdx = m.index + m[0].length - 1;
    if (text[braceIdx] !== "{") continue;
    return scanJsonObjectStringValues(text, braceIdx);
  }
  return [];
}

function forEachDirectObjectKey(
  text: string,
  objectOpenBrace: number,
  objectCloseBrace: number,
  visit: (key: string, valueStart: number) => void,
): void {
  let i = skipWs(text, objectOpenBrace + 1);
  while (i < objectCloseBrace) {
    i = skipWs(text, i);
    if (text[i] !== '"') break;
    const ks = readJsonString(text, i);
    if (!ks) break;
    const key = text.slice(ks.valueStart, ks.valueEnd);
    i = skipWs(text, ks.end);
    if (text[i] !== ":") break;
    i = skipWs(text, i + 1);
    const valueStart = i;
    visit(key, valueStart);
    i = skipJsonValue(text, valueStart);
    i = skipWs(text, i);
    if (text[i] === ",") {
      i++;
      continue;
    }
    break;
  }
}

function scanJsonArrayOfStringSegments(text: string, arrayStart: number): TextSegment[] {
  const out: TextSegment[] = [];
  let i = skipWs(text, arrayStart);
  if (text[i] !== "[") return out;
  i++;
  while (i < text.length) {
    i = skipWs(text, i);
    if (text[i] === "]") break;
    if (text[i] === '"') {
      const s = readJsonString(text, i);
      if (!s) break;
      out.push({
        start: s.valueStart,
        end: s.valueEnd,
        content: text.slice(s.valueStart, s.valueEnd),
      });
      i = s.end;
    } else {
      i = skipJsonValue(text, i);
    }
    i = skipWs(text, i);
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] === "]") break;
    break;
  }
  return out;
}

function scanJsonObjectStringValues(text: string, objectBraceIdx: number): TextSegment[] {
  const out: TextSegment[] = [];
  const close = findMatchingBrace(text, objectBraceIdx);
  if (close === null) return out;

  forEachDirectObjectKey(text, objectBraceIdx, close, (key, valueStart) => {
    void key;
    const j = skipWs(text, valueStart);
    if (j >= close) return;
    if (text[j] !== '"') return;
    const val = readJsonString(text, j);
    if (!val) return;
    out.push({
      start: val.valueStart,
      end: val.valueEnd,
      content: text.slice(val.valueStart, val.valueEnd),
    });
  });
  return out;
}

function extractAllowFromPermissionsObject(text: string, permObjectOpen: number): TextSegment[] {
  const permClose = findMatchingBrace(text, permObjectOpen);
  if (permClose === null) return [];

  const out: TextSegment[] = [];
  forEachDirectObjectKey(text, permObjectOpen, permClose, (key, valueStart) => {
    if (key !== "allow") return;
    const j = skipWs(text, valueStart);
    if (text[j] === "[") {
      out.push(...scanJsonArrayOfStringSegments(text, j));
      return;
    }
    if (text[j] === '"') {
      const s = readJsonString(text, j);
      if (!s) return;
      out.push({
        start: s.valueStart,
        end: s.valueEnd,
        content: text.slice(s.valueStart, s.valueEnd),
      });
    }
  });
  return out;
}

function extractRootPermissionsAllow(text: string): TextSegment[] {
  const root = getRootObjectBounds(text);
  if (!root) return [];

  let found: TextSegment[] = [];
  forEachDirectObjectKey(text, root.open, root.close, (key, valueStart) => {
    if (key !== "permissions") return;
    const j = skipWs(text, valueStart);
    if (text[j] !== "{") return;
    found = extractAllowFromPermissionsObject(text, j);
  });
  return found;
}

function extractScriptsForRootBounds(text: string, root: { open: number; close: number }): TextSegment[] {
  let found: TextSegment[] = [];
  forEachDirectObjectKey(text, root.open, root.close, (key, valueStart) => {
    if (key !== "scripts") return;
    const j = skipWs(text, valueStart);
    if (text[j] !== "{") return;
    found = scanJsonObjectStringValues(text, j);
  });
  return found;
}

/** Root scripts object string values, or key-scan fallback if the root object cannot be opened. */
function extractPackageJsonScripts(text: string): TextSegment[] {
  const root = getRootObjectBounds(text);
  if (root) {
    return extractScriptsForRootBounds(text, root);
  }
  return extractScriptsByKeyScan(text);
}

function isPackageJsonFile(filePath: string | undefined): boolean {
  if (!filePath) return false;
  return path.basename(filePath).toLowerCase() === "package.json";
}

/** Trim segment to non-empty content; drop if shorter than {@link MIN_SEGMENT_CHARS}. */
export function trimAndFilterSegment(s: TextSegment): TextSegment | null {
  const raw = s.content;
  const t = raw.trim();
  if (t.length < MIN_SEGMENT_CHARS) return null;
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  return {
    start: s.start + lead,
    end: s.end - trail,
    content: t,
  };
}

export function dedupeSortedSegments(segments: TextSegment[]): TextSegment[] {
  const seen = new Set<string>();
  const out: TextSegment[] = [];
  for (const s of segments) {
    const key = `${s.start}:${s.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Extract command-like strings only from:
 * - Root `permissions.allow` (string or array of strings)
 * - Root `scripts` object values **only** when the file is `package.json`
 */
export function extractJsonCommandSegments(text: string, filePath?: string): TextSegment[] {
  const segments: TextSegment[] = [];

  segments.push(...extractRootPermissionsAllow(text));

  if (isPackageJsonFile(filePath)) {
    segments.push(...extractPackageJsonScripts(text));
  }

  const normalized: TextSegment[] = [];
  for (const s of segments) {
    const n = trimAndFilterSegment(s);
    if (n) normalized.push(n);
  }

  normalized.sort((a, b) => a.start - b.start);
  return dedupeSortedSegments(normalized);
}
