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

/** Card skins: grays, white and black only. */
export const CARD_THEMES: Record<CardColor, Theme> = {
  ember: {
    bg: "linear-gradient(120deg,#2a2a2e 0%,#4a4a51 60%,#6b6b73 100%)",
    text: "#ffffff",
    sub: "rgba(245,245,247,.78)",
    accent: "#f5f5f7",
    iconBg: "rgba(255,255,255,.2)",
  },
  amber: {
    bg: "linear-gradient(90deg,#e8e8ec 0%,#c9c9cf 100%)",
    text: "#0b0b0c",
    sub: "#46464d",
    accent: "#2e2e33",
    iconBg: "rgba(11,11,12,.1)",
  },
  cream: {
    bg: "linear-gradient(120deg,#fafafb 0%,#e0e0e4 100%)",
    text: "#0b0b0c",
    sub: "#55555c",
    accent: "#2e2e33",
    iconBg: "rgba(11,11,12,.08)",
  },
  copper: {
    bg: "linear-gradient(120deg,#a9a9b1 0%,#8e8e96 100%)",
    text: "#0b0b0c",
    sub: "rgba(11,11,12,.72)",
    accent: "#0b0b0c",
    iconBg: "rgba(11,11,12,.12)",
  },
  rust: {
    bg: "linear-gradient(120deg,#3a3a40 0%,#17171a 100%)",
    text: "#f5f5f7",
    sub: "rgba(212,212,217,.85)",
    accent: "#d4d4d9",
    iconBg: "rgba(255,255,255,.14)",
  },
  noir: {
    bg: "linear-gradient(120deg,#1c1c1f 0%,#0b0b0c 100%)",
    text: "#f5f5f7",
    sub: "rgba(245,245,247,.6)",
    accent: "#b8b8bf",
    iconBg: "rgba(255,255,255,.1)",
  },
};

export const CARD_COLORS = Object.keys(CARD_THEMES) as CardColor[];
export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

/** Fixed-shape redaction so the length of the secret is not leaked. */
export const REDACTED = "•••• •••••• ••••• •••";
