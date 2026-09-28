export type User = {
  id: number;
  email: string;
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
