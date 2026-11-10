"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const TOOLS = [
  { id: "chatgpt", label: "ChatGPT", ask: "I have pasta, garlic and tomatoes. What can I make?" },
  { id: "claude", label: "Claude", ask: "Help me refactor my login form. Same stack as before." },
  { id: "gemini", label: "Gemini", ask: "Find olive oil and basil near me" },
] as const;

/**
 * Interactive hero panel. Pick the AI you are switching to and a card of your
 * context travels from the source to it. A soft spotlight follows the pointer.
 */
export function RelayHero() {
  const ref = useRef<HTMLDivElement>(null);
  const [to, setTo] = useState(2);
  const [spot, setSpot] = useState({ x: 50, y: 30 });
  const from = to === 0 ? 1 : 0;

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setSpot({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
      }}
      className="relative mx-auto max-w-[1000px] overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-[#1C1C1F] to-[#0B0B0C] px-6 py-12 text-white shadow-[0_40px_80px_-30px_rgba(10,10,14,.7)] sm:px-12 sm:py-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-200"
        style={{ background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,.14), transparent 70%)` }}
      />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <p className="m-0 text-[13px] font-extrabold uppercase tracking-[0.18em] text-[#9A9AA2]">Switching to</p>
        <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Choose the AI you are switching to">
          {TOOLS.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={to === i}
              onClick={() => setTo(i)}
              className={`min-h-[40px] rounded-full px-5 text-sm font-semibold transition ${
                to === i ? "bg-white text-[#0B0B0C]" : "bg-white/10 text-[#D4D4D9] hover:bg-white/20"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <Bubble label={TOOLS[from].label} text={TOOLS[from].ask} tone="from" k={`from-${from}`} />

        <div aria-hidden className="relative hidden h-10 min-w-[80px] flex-1 sm:block">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-white/10 via-white/40 to-white/10" />
          <motion.div
            key={to}
            initial={{ left: "0%", opacity: 0 }}
            animate={{ left: "calc(100% - 28px)", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.6 }}
            className="absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-lg bg-white shadow-[0_0_24px_rgba(255,255,255,.6)]"
          />
        </div>

        <Bubble label={TOOLS[to].label} text="Already knows your project, your stack and the cards you picked." tone="to" k={`to-${to}`} />
      </div>

      <p className="relative mx-auto mb-0 mt-8 max-w-[520px] text-center text-sm leading-normal text-[#9A9AA2]">
        You choose what travels. Nothing leaves your browser until you send it.
      </p>
    </div>
  );
}

function Bubble({ label, text, tone, k }: { label: string; text: string; tone: "from" | "to"; k: string }) {
  return (
    <div className="min-w-0 flex-1 basis-[260px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={k}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className={`rounded-[20px] p-5 text-left ${
            tone === "to" ? "bg-white text-[#0B0B0C]" : "border border-white/15 bg-white/[0.06] text-[#E8E8EC]"
          }`}
        >
          <div className={`text-[12px] font-extrabold uppercase tracking-wider ${tone === "to" ? "text-[#5E5E66]" : "text-[#9A9AA2]"}`}>{label}</div>
          <div className={`mt-2 text-[15px] leading-normal ${tone === "to" ? "font-semibold" : ""}`}>{text}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
