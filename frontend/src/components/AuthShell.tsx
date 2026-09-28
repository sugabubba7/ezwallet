"use client";

import { motion } from "framer-motion";
import { Cpu, Lock, ShieldCheck } from "lucide-react";
import { CARD_THEMES } from "@/lib/cards";
import { Logo } from "./Logo";

const PEEK = [
  { label: "ARGON2ID VAULT", sub: "PIN + password hashed", icon: Lock, theme: CARD_THEMES.noir },
  { label: "GEMINI PROXY", sub: "Zero data retention", icon: Cpu, theme: CARD_THEMES.cream },
  { label: "ENCRYPTED CONTEXT", sub: "AES (Fernet) at rest", icon: ShieldCheck, theme: CARD_THEMES.ember },
];

/** Auth screens: the form lives inside the leather pocket, cards peeking out. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="mb-2 self-start sm:absolute sm:left-6 sm:top-6 sm:mb-0">
        <Logo />
      </div>
      <div className="relative w-full max-w-[440px] pt-[186px]">
        {PEEK.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.1 + i * 0.08 }}
            className="absolute left-1/2 flex h-28 items-start justify-between rounded-[22px] px-6 pt-5 shadow-card"
            style={{ top: i * 60, x: "-50%", width: `${88 + i * 4}%`, background: c.theme.bg, zIndex: i + 1 }}
          >
            <div className="flex items-center gap-3">
              <c.icon className="h-6 w-6" style={{ color: c.theme.accent }} />
              <div>
                <div className="text-[15px] font-semibold tracking-wide" style={{ color: c.theme.text }}>{c.label}</div>
                <div className="text-xs font-medium" style={{ color: c.theme.sub }}>{c.sub}</div>
              </div>
            </div>
            <span className="mt-1 h-6 w-6 rounded-full border-2 border-dashed" style={{ borderColor: c.theme.accent }} />
          </motion.div>
        ))}

        <div className="leather relative z-10 rounded-[34px] rounded-b-[56px] px-7 pb-9 pt-8 shadow-[0_30px_60px_-20px_rgba(20,6,0,.7)]">
          <div className="pointer-events-none absolute inset-[9px] rounded-[26px] rounded-b-[48px] border border-dashed border-stitch/80" />
          <div className="relative">
            <p className="eyebrow text-center !text-white/45">{subtitle}</p>
            <h1 className="mt-2 text-center text-2xl font-semibold text-white">{title}</h1>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
