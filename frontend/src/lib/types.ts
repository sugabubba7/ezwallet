export type User = {
  id: number;
  email: string | null;
  username: string | null;
  has_password: boolean;
  has_pin: boolean;
  google_linked: boolean;
  google_picture: string | null;
  created_at: string;
};

export type Category = "personal" | "medical" | "work" | "finance" | "travel" | "code" | "other";
export type CardColor = "ember" | "amber" | "cream" | "copper" | "rust" | "noir";

export type CardMeta = {
  id: number;
  label: string;
  category: Category;
  color: CardColor;
  position: number;
  created_at: string;
};

export type CardRevealed = CardMeta & { content: string };

export type Chat = {
  id: number;
  title: string;
  model: string;
  tags: string[];
  card_label: string | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  message_count: number;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
};

export type LlmStatus = { configured: boolean; model: string; endpoint: string };

/** What to call the user on screen: username if set, else email. */
export const displayName = (u: Pick<User, "email" | "username">) => u.username ?? u.email ?? "you";

// ---- Competitor tracker (assignment 1B). Everything below came from the web: render as TEXT only. ----
export type TrackerSource = { url: string; title: string; quote: string };
export type TrackerDevelopment = {
  id: number;
  rank: number;
  section: "new" | "still";
  title: string;
  summary: string;
  sources: TrackerSource[];
};
export type TrackerRunSummary = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "complete" | "partial" | "failed";
  partial_reason: string | null;
  topic: string;
  k: number;
  stats: Record<string, unknown>;
  new_count: number;
  still_count: number;
  dropped_count: number;
  article_counts: Record<"fetched" | "skipped" | "rejected" | "failed", number>;
};
export type TrackerRunDetail = TrackerRunSummary & {
  report_md: string;
  developments: TrackerDevelopment[];
  dropped: { id: number; title: string; summary: string }[];
};
export type TrackerArticle = {
  id: number;
  url: string;
  title: string;
  status: "fetched" | "skipped" | "rejected" | "failed";
  reason: string | null;
  fetched_at: string;
};
