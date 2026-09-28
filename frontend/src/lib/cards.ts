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

/** Card skins modelled on the mockup's Chase / Capital One / Payoff cards. */
export const CARD_THEMES: Record<CardColor, Theme> = {
  sapphire: {
    bg: "linear-gradient(120deg,#3b72c4 0%,#5b93dc 60%,#6fa8ea 100%)",
    text: "#ffffff",
    sub: "rgba(255,255,255,.72)",
    accent: "#dbeafe",
    iconBg: "rgba(255,255,255,.18)",
  },
  ivory: {
    bg: "linear-gradient(120deg,#fbf8f2 0%,#f4efe4 100%)",
    text: "#1c2433",
    sub: "#6b7280",
    accent: "#c2412d",
    iconBg: "rgba(194,65,45,.1)",
  },
  peach: {
    bg: "linear-gradient(90deg,#f8dcc0 0%,#f6c9a0 100%)",
    text: "#2a1a10",
    sub: "#c25a22",
    accent: "#d9622b",
    iconBg: "rgba(217,98,43,.14)",
  },
  mint: {
    bg: "linear-gradient(120deg,#cdeedd 0%,#9dd8bd 100%)",
    text: "#0f2e22",
    sub: "#2f7a5a",
    accent: "#1f7a55",
    iconBg: "rgba(31,122,85,.14)",
  },
  lilac: {
    bg: "linear-gradient(120deg,#e3dafb 0%,#bfaef2 100%)",
    text: "#231a45",
    sub: "#6a55b8",
    accent: "#5b43b5",
    iconBg: "rgba(91,67,181,.14)",
  },
  graphite: {
    bg: "linear-gradient(120deg,#41454d 0%,#26282d 100%)",
    text: "#f3f4f6",
    sub: "rgba(243,244,246,.6)",
    accent: "#f08a4b",
    iconBg: "rgba(255,255,255,.1)",
  },
};

export const CARD_COLORS = Object.keys(CARD_THEMES) as CardColor[];
export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

/** Fixed-shape redaction so the length of the secret is not leaked. */
export const REDACTED = "•••• •••••• ••••• •••";
