export type RiskLevel = "high" | "medium" | "low";

export interface RiskRule {
  /** Regex applied to normalized command text (`riskEngine`);
   * highlights use the original segment.
   */
  pattern: RegExp;

  /** Risk level used for diagnostics and styling. */
  risk: RiskLevel;

  /** Short explanation shown in hover. */
  description: string;

  /** Bullet points under “Why it matters”. */
  why: string[];

  /** Bullet points under “When it could be risky”. */
  edgeCases: string[];

  /** Actionable guidance for safer usage. */
  recommendation: string;

  /** Optional short inline hint after HIGH matches. */
  inlineHint?: string;

  /** One-line Problems panel summary (no newlines). */
  diagnosticSummary: string;
}

/**
 * Central rule list for PermScope.
 * Rules match against normalized command text extracted from JSON/YAML.
 */
export const rules: RiskRule[] = [
  {
    pattern: /python3\s+-c\b/gi,
    risk: "high",
    description: "Runs inline Python code from the command line.",
    why: [
      "Can read local files and secrets.",
      "Can open network connections.",
      "Inline code can run anything on your system.",
    ],
    edgeCases: [
      "Pasted or generated commands can hide payloads.",
      "Config or dependency changes can swap code.",
    ],
    recommendation: "Move code into a checked-in script or module.",
    inlineHint: "executes arbitrary code",
    diagnosticSummary: "Executes arbitrary code",
  },

  {
    pattern: /\brm\s+-rf\b/i,
    risk: "high",
    description: "Recursively deletes files and directories.",
    why: [
      "Removes large directory trees in one command.",
      "Small path mistakes can delete the wrong files.",
      "Recovery is often not possible.",
    ],
    edgeCases: [
      "Variables or globs can widen what gets deleted.",
      "Scripts may run this in shared environments.",
    ],
    recommendation: "Double-check paths before running destructive commands.",
    inlineHint: "destructive delete",
    diagnosticSummary: "Deletes files recursively",
  },

  {
    pattern: /\b(bash|sh)\s+-c\b/i,
    risk: "high",
    description: "Runs a full shell command from a string.",
    why: [
      "The string is arbitrary shell code.",
      "Easy to hide in scripts or environment variables.",
      "Same power as an interactive shell.",
    ],
    edgeCases: [
      "Generated or pasted strings can change behavior.",
      "Quoting mistakes can run unintended commands.",
    ],
    recommendation: "Use a script file or a safer API instead.",
    inlineHint: "runs arbitrary shell command",
    diagnosticSummary: "Runs arbitrary shell command",
  },

  {
    pattern: /(curl|wget)[^\n]*\|\s*(bash|sh)\b/i,
    risk: "high",
    description: "Pipes remote data directly into a shell.",
    why: [
      "Remote bytes become executable input.",
      "No chance to review the full script.",
      "Response changes what runs.",
    ],
    edgeCases: [
      "Server or redirect changes can swap payloads.",
      "TLS does not guarantee script safety.",
    ],
    recommendation: "Download first, verify, then run locally.",
    inlineHint: "pipes remote code to shell",
    diagnosticSummary: "Pipes remote code to shell",
  },

  {
    pattern: /\bcurl\s+https?:\/\//i,
    risk: "medium",
    description: "Fetches data from a remote HTTP or HTTPS source.",
    why: [
      "Pulls content from external sources.",
      "URLs and headers affect what you receive.",
      "Often used before executing scripts.",
    ],
    edgeCases: [
      "Redirects may change the final destination.",
      "Content may differ from what you expect.",
    ],
    recommendation: "Verify the URL and content before using it.",
    diagnosticSummary: "Fetches remote content",
  },

  {
    pattern: /\bbash\b[^\n]*\*/i,
    risk: "medium",
    description: "Uses glob patterns that may match unintended files.",
    why: [
      "Globs expand before the command runs.",
      "Loose patterns change arguments.",
      "May affect more files than intended.",
    ],
    edgeCases: [
      "Hidden or oddly named files may match.",
      "Unquoted variables can widen matches.",
    ],
    recommendation: "Quote variables and narrow glob patterns.",
    diagnosticSummary: "Expands unintended file paths",
  },

  {
    pattern: /pytest[\s\S]*--collect-only/,
    risk: "low",
    description: "Lists tests without running them.",
    why: [
      "Does not execute test bodies.",
      "Useful for quick discovery checks.",
    ],
    edgeCases: [
      "Plugins may run code during collection.",
      "Older setups may behave differently.",
    ],
    recommendation: "Safe for discovery; review plugins if untrusted.",
    diagnosticSummary: "Read-only test discovery",
  },
];