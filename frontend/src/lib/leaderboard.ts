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

export type Slice = { label: string; value: number; note: string };
export type ChartSpec = { id: string; title: string; subtitle: string; unit: string; slices: Slice[]; footnote: string };

const GOOGLE_TOTAL = LEADERBOARD[0].tokensPerMonthT as number;
const GOOGLE_API = LEADERBOARD[1].tokensPerMonthT as number;
const OPENAI_API = LEADERBOARD[2].tokensPerMonthT as number;

/** Charts are computed from the rows above so the numbers can never disagree with the table. */
export const CHARTS: ChartSpec[] = [
  {
    id: "api-share",
    title: "Share of known API volume",
    subtitle: "The one like-for-like comparison available: API traffic only",
    unit: "T tokens / month",
    slices: [
      { label: "Google (Gemini API)", value: GOOGLE_API, note: "≈19B tokens/min, May 2026" },
      { label: "OpenAI (API)", value: OPENAI_API, note: "≈15B tokens/min, Mar 2026" },
    ],
    footnote: "Anthropic and every other provider are missing because they publish no volume, so these shares are only between the two disclosed.",
  },
  {
    id: "google-split",
    title: "Inside Google's 3.2 quadrillion",
    subtitle: "Where Google's headline number comes from",
    unit: "T tokens / month",
    slices: [
      { label: "Gemini API (developers)", value: GOOGLE_API, note: "derived from the API rate" },
      { label: "Search, Workspace, Android, other", value: GOOGLE_TOTAL - GOOGLE_API, note: "total minus the API" },
    ],
    footnote: "Most of Google's headline volume is its own products, not customers calling the API. That is why it cannot be compared with OpenAI's API-only figure.",
  },
];
