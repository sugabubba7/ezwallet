"use client";

import { motion } from "framer-motion";
import { Cpu, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";

const PEEK = [
  { label: "ARGON2ID VAULT", sub: "PIN + password hashed", icon: Lock, bg: "linear-gradient(120deg,#3b72c4,#6fa8ea)", fg: "#fff", subFg: "rgba(255,255,255,.75)" },
  { label: "GEMINI PROXY", sub: "Zero data retention", icon: Cpu, bg: "linear-gradient(120deg,#fbf8f2,#f4efe4)", fg: "#1c2433", subFg: "#6b7280" },
  { label: "ENCRYPTED CONTEXT", sub: "AES (Fernet) at rest", icon: ShieldCheck, bg: "linear-gradient(90deg,#f8dcc0,#f6c9a0)", fg: "#2a1a10", subFg: "#c25a22" },
];

/** Auth screens: the form lives inside the leather pocket from mockup 1. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="bg-sunrise relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="mb-2 self-start sm:absolute sm:left-6 sm:top-6 sm:mb-0">
        <Logo className="text-leather-900 [&_span:last-child]:text-leather-900" />
      </div>
      <div className="relative w-full max-w-[440px] pt-[170px]">
        {PEEK.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.1 + i * 0.08 }}
            className="absolute left-1/2 flex h-28 items-start justify-between rounded-[22px] px-6 pt-5 shadow-card"
            style={{ top: i * 60, x: "-50%", width: `${88 + i * 4}%`, background: c.bg, zIndex: i + 1 }}
          >
            <div className="flex items-center gap-3">
              <c.icon className="h-6 w-6" style={{ color: c.fg }} />
              <div>
                <div className="text-[15px] font-semibold tracking-wide" style={{ color: c.fg }}>{c.label}</div>
                <div className="text-xs font-medium" style={{ color: c.subFg }}>{c.sub}</div>
              </div>
            </div>
            <span className="mt-1 h-6 w-6 rounded-full border-2 border-dashed" style={{ borderColor: c.subFg }} />
          </motion.div>
        ))}

        <div className="leather relative z-10 rounded-[34px] rounded-b-[56px] px-7 pb-9 pt-8 shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)]">
          <div className="pointer-events-none absolute inset-[9px] rounded-[26px] rounded-b-[48px] border border-dashed border-stitch/70" />
          <div className="relative">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{subtitle}</p>
            <h1 className="mt-2 text-center text-2xl font-semibold">{title}</h1>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
