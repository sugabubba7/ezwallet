/*
 * LLM token-volume leaderboard data. Compiled 2026-10-04 from public statements and press reports.
 * Nothing here is invented: where a company has not published a figure, `tokensPerMonthT` is null and the
 * row says so. `tokensPerMonthT` is in TRILLIONS of tokens per month.
 */
export type Confidence = "disclosed" | "derived" | "undisclosed";

export type LeaderboardRow = {
  company: string;
  tokensPerMonthT: number | null;
  confidence: Confidence;
  scope: string;
  asOf: string;
  how: string;
  sources: { label: string; url: string }[];
};

export const LEADERBOARD_AS_OF = "2026-10-04";

export const LEADERBOARD: LeaderboardRow[] = [
  {
    company: "Google (Gemini, all surfaces)",
    tokensPerMonthT: 3200,
    confidence: "disclosed",
    scope: "Search, Workspace, Android and the Gemini API combined, including internal reasoning and tool tokens",
    asOf: "May 2026 (Google I/O)",
    how: "Stated by Google: 3.2 quadrillion tokens per month, about 7× a year earlier.",
    sources: [
      { label: "Digg summary of the I/O announcement", url: "https://digg.com/ai/yy2eli63?rank=27" },
      { label: "Crypto Briefing", url: "https://cryptobriefing.com/google-3-2-quadrillion-tokens-monthly/" },
    ],
  },
  {
    company: "Google (Gemini API only)",
    tokensPerMonthT: 821,
    confidence: "derived",
    scope: "Developer API traffic only",
    asOf: "May 2026",
    how: "Reported ≈19 billion tokens/min × 43,200 minutes in a 30-day month ≈ 821 trillion.",
    sources: [{ label: "Crypto Briefing", url: "https://cryptobriefing.com/google-3-2-quadrillion-tokens-monthly/" }],
  },
  {
    company: "OpenAI (API only)",
    tokensPerMonthT: 648,
    confidence: "derived",
    scope: "API traffic only. ChatGPT consumer traffic is NOT included, so this understates OpenAI's total.",
    asOf: "March 2026",
    how: "Reported ≈15 billion tokens/min × 43,200 minutes ≈ 648 trillion. Secondary source; treat as medium confidence.",
    sources: [{ label: "Axis Intelligence, OpenAI statistics 2026", url: "https://axis-intelligence.com/?p=36386" }],
  },
  {
    company: "Anthropic (Claude)",
    tokensPerMonthT: null,
    confidence: "undisclosed",
    scope: "No volume figure found in public statements",
    asOf: "-",
    how: "Not published. Use the estimator below with a revenue figure you trust.",
    sources: [],
  },
];

export const CAVEATS = [
  "These numbers are not like-for-like. Google's total counts every surface and hidden reasoning tokens; OpenAI's figure is API-only.",
  "Tokens processed per month measures inference traffic, not how much training data a model has seen. Training-set sizes are mostly undisclosed.",
  "Per-model token shares are visible only for traffic routed through OpenRouter's public rankings, which skews toward developers and coding agents.",
];
