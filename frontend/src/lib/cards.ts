import { Briefcase, Code2, HeartPulse, KeyRound, Plane, User as UserIcon, Wallet, type LucideIcon } from "lucide-react";
import type { CardColor, Category } from "./types";

export const CATEGORY_META: Record<Category, { label: string; icon: LucideIcon }> = {
  personal: { label: "Personal", icon: UserIcon },
  medical: { label: "Medical", icon: HeartPulse },
  work: { label: "Work", icon: Briefcase },
  finance: { label: "Finance", icon: Wallet },
  travel: { label: "Travel", icon: Plane },
  code: { label: "Code", icon: Code2 },
  other: { label: "Other", icon: KeyRound },
};

type Theme = { bg: string; text: string; sub: string; accent: string; iconBg: string };

/** Card skins: orange shades and warm blacks only. */
export const CARD_THEMES: Record<CardColor, Theme> = {
  ember: {
    bg: "linear-gradient(120deg,#d9601c 0%,#ee7d2e 60%,#f79a4c 100%)",
    text: "#ffffff",
    sub: "rgba(255,244,235,.8)",
    accent: "#fff4eb",
    iconBg: "rgba(255,255,255,.2)",
  },
  amber: {
    bg: "linear-gradient(90deg,#f7c089 0%,#f5a95e 100%)",
    text: "#2a0f04",
    sub: "#8a3a0c",
    accent: "#9e3e12",
    iconBg: "rgba(158,62,18,.14)",
  },
  cream: {
    bg: "linear-gradient(120deg,#fff6ec 0%,#fbe6d0 100%)",
    text: "#2a0f04",
    sub: "#9e5a2e",
    accent: "#c9551a",
    iconBg: "rgba(201,85,26,.12)",
  },
  copper: {
    bg: "linear-gradient(120deg,#b4602e 0%,#d8854a 100%)",
    text: "#ffffff",
    sub: "rgba(255,244,235,.78)",
    accent: "#fff4eb",
    iconBg: "rgba(255,255,255,.18)",
  },
  rust: {
    bg: "linear-gradient(120deg,#6e210a 0%,#a8380f 100%)",
    text: "#fff4eb",
    sub: "rgba(255,200,149,.85)",
    accent: "#ffc895",
    iconBg: "rgba(255,200,149,.16)",
  },
  noir: {
    bg: "linear-gradient(120deg,#2a211b 0%,#120d0a 100%)",
    text: "#fff4eb",
    sub: "rgba(255,244,235,.6)",
    accent: "#fb8a35",
    iconBg: "rgba(251,138,53,.14)",
  },
};

export const CARD_COLORS = Object.keys(CARD_THEMES) as CardColor[];
export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

/** Fixed-shape redaction so the length of the secret is not leaked. */
export const REDACTED = "•••• •••••• ••••• •••";
