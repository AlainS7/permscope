/** Max distinct idea bullets per section (each rule array entry is usually one idea). */
const HOVER_BULLETS_MAX_PER_SECTION = 3;

const LONE_PUNCT = /^[.,;:!?…]+$/u;

function hasLetterOrNumber(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s);
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function mergeLonePunctuation(bullets: string[]): string[] {
  const out: string[] = [];
  for (const b of bullets) {
    const t = b.trim();
    if (!t) continue;
    if (LONE_PUNCT.test(t) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}${t}`;
    } else {
      out.push(t);
    }
  }
  return out;
}

/** `` `code` `` → plain text; shorten long spans. */
function flattenInlineCode(s: string): string {
  return s.replace(/`([^`]*)`/g, (_, inner: string) => {
    const t = inner.trim();
    if (!t) return "";
    if (t.length <= 18) return t;
    return `${t.slice(0, 16)}…`;
  });
}

/** e.g. curl/wget → curl or wget; spaced “ / ” → “ or ”. */
function normalizeSlashesInProse(s: string): string {
  let t = s.replace(/\bcurl\s*\/\s*wget\b/gi, "curl or wget");
  t = t.replace(/\b([A-Za-z][\w-]{1,14})\s*\/\s*([A-Za-z][\w-]{1,14})\b/g, (full, a: string, b: string) => {
    if (full.includes("://") || /\*/.test(full) || /\.(sh|py|js|ts|json|yml|yaml)\b/i.test(full)) {
      return full;
    }
    return `${a} or ${b}`;
  });
  return t.replace(/\s\/\s/g, " or ");
}

function preprocessBulletSource(s: string): string {
  return normalizeSpaces(normalizeSlashesInProse(flattenInlineCode(s)));
}

/**
 * Split one rule string into separate ideas **only** on semicolon or em/en dash.
 * Do not split commas or sentence periods — those stay one bullet with soft wrap.
 */
function splitIntoDistinctIdeas(s: string): string[] {
  const t = preprocessBulletSource(s);
  if (!t) return [];

  const out: string[] = [];
  for (const semi of t.split(/\s*;\s*/).map((p) => normalizeSpaces(p)).filter(Boolean)) {
    if (!/[—–]/.test(semi)) {
      out.push(semi);
      continue;
    }
    const dashSplit = normalizeSpaces(semi.replace(/[—–]/g, ". "))
      .split(/\.\s+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p, i, arr) => {
        if (i < arr.length - 1 && !/[.!?…]$/.test(p)) return `${p}.`;
        return p;
      });
    out.push(...dashSplit);
  }
  return out;
}

/**
 * One rule string → one bullet per line of text (VS Code wraps to the hover width). Only split
 * into multiple bullets on `;` or em/en dash when those mark separate ideas.
 */
export function formatHoverBullets(lines: string[]): string[] {
  const out: string[] = [];

  outer: for (const raw of lines) {
    for (const idea of splitIntoDistinctIdeas(raw)) {
      if (out.length >= HOVER_BULLETS_MAX_PER_SECTION) break outer;
      const body = normalizeSpaces(idea);
      if (!body || !hasLetterOrNumber(body)) continue;
      out.push(body);
    }
  }

  return mergeLonePunctuation(out).slice(0, HOVER_BULLETS_MAX_PER_SECTION);
}
