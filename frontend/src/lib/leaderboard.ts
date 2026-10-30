/*
 * LLM token-volume leaderboard data. Refreshed 2026-10-30 from public statements and press reports.
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

export const LEADERBOARD_AS_OF = "2026-10-30";

export const LEADERBOARD: LeaderboardRow[] = [
  {
    company: "Google (Gemini, all surfaces)",
    tokensPerMonthT: 3200,
    confidence: "disclosed",
    scope: "Search, Workspace, Android and the Gemini API combined, including internal reasoning and tool tokens",
    asOf: "May 2026 (Google I/O)",
    how: "Stated by Google: 3.2 quadrillion tokens per month, about 7× a year earlier. Still the latest total found: nothing newer turned up as of 2026-10-30.",
    sources: [
      { label: "Digg summary of the I/O announcement", url: "https://digg.com/ai/yy2eli63?rank=27" },
      { label: "Crypto Briefing", url: "https://cryptobriefing.com/google-3-2-quadrillion-tokens-monthly/" },
    ],
  },
  {
    company: "Google (Gemini API only)",
    tokensPerMonthT: 1380,
    confidence: "derived",
    scope: "Developer API traffic only",
    asOf: "Oct 2026 (Q3 earnings)",
    how: "Stated by Google with its Q3 2026 results (28 Oct 2026): first-party model APIs processing nearly 32 billion tokens/min, about 40% more than the 22 billion a quarter earlier. × 43,200 minutes in a 30-day month ≈ 1.38 quadrillion (about 1,380 trillion).",
    sources: [
      { label: "Alphabet Q3 2026 earnings release (SEC filing)", url: "https://www.sec.gov/Archives/edgar/data/0001652044/000165204426000080/googexhibit991q32026.htm" },
      { label: "Alphabet Q3 2026 earnings call transcript (Motley Fool)", url: "https://www.fool.com/earnings/call-transcripts/2026/10/29/alphabet-googl-q3-2026-earnings-call-transcript/" },
      { label: "Alphabet Q3 earnings call highlights (Yahoo Finance)", url: "https://finance.yahoo.com/markets/stocks/articles/alphabet-q3-earnings-call-highlights-050416594.html" },
    ],
  },
  {
    company: "OpenAI (API only)",
    tokensPerMonthT: 648,
    confidence: "derived",
    scope: "API traffic only. ChatGPT consumer traffic is NOT included, so this understates OpenAI's total.",
    asOf: "March 2026",
    how: "OpenAI says its API platform handles over 15 billion tokens/min; × 43,200 minutes ≈ 648 trillion. Repeated by secondary outlets. No newer OpenAI API figure found as of 2026-10-30.",
    sources: [
      { label: "OpenAI, funding announcement", url: "https://openai.com/index/accelerating-the-next-phase-ai/" },
      { label: "Axis Intelligence, OpenAI statistics 2026 (secondary)", url: "https://axis-intelligence.com/?p=36386" },
    ],
  },
  {
    company: "Anthropic (Claude)",
    tokensPerMonthT: null,
    confidence: "undisclosed",
    scope: "No volume figure found in public statements",
    asOf: "-",
    how: "Not published by Anthropic. Third-party forecasts exist (for example SemiAnalysis, about 5 quadrillion/month for June 2026) but they are estimates, not disclosures, so none is shown. Use the estimator below with a revenue figure you trust.",
    sources: [{ label: "Digg, SemiAnalysis forecast (estimate, not a disclosure)", url: "https://digg.com/ai/ts9o7y5r" }],
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
      { label: "Google (Gemini API)", value: GOOGLE_API, note: "≈32B tokens/min, Oct 2026" },
      { label: "OpenAI (API)", value: OPENAI_API, note: "≈15B tokens/min, Mar 2026" },
    ],
    footnote: "Anthropic and every other provider are missing because they publish no volume, so these shares are only between the two disclosed. The two figures are from different dates (Google October 2026, OpenAI March 2026), and Google's has been growing fast.",
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
    footnote: "Most of Google's headline volume is its own products, not customers calling the API. That is why it cannot be compared with OpenAI's API-only figure. The API figure is from October 2026 and the total from May 2026 (no newer total found), so the split mixes dates and is approximate.",
  },
];
