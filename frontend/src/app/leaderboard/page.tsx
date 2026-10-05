"use client";

import { Calculator, ExternalLink, Info, Loader2, PieChart, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useRequireAuth } from "@/lib/auth";
import { CAVEATS, CHARTS, LEADERBOARD, LEADERBOARD_AS_OF, type ChartSpec, type Confidence } from "@/lib/leaderboard";

const CONF: Record<Confidence, { label: string; cls: string }> = {
  disclosed: { label: "Disclosed by the company", cls: "bg-white/15 text-white" },
  derived: { label: "Derived from a stated rate", cls: "bg-amber-400/20 text-amber-100" },
  undisclosed: { label: "Not disclosed", cls: "bg-ember-600/40 text-ember-100" },
};

const fmtT = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)} quadrillion` : `${Math.round(t)} trillion`);

const SLICE_COLORS = ["#ffffff", "#ff9a45", "#5b1d08", "#ffd9b8"];

/** Donut chart in plain SVG. Hovering (or focusing) a legend row highlights its slice. */
function Donut({ spec }: { spec: ChartSpec }) {
  const [hot, setHot] = useState<number | null>(null);
  const total = spec.slices.reduce((t, s) => t + s.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  const GAP = 3; // visual gap between slices, in px of arc length
  let acc = 0;
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} quadrillion` : `${Math.round(v)} trillion`);
  const summary = spec.slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ");
  return (
    <figure className="rounded-2xl bg-black/20 p-4">
      <figcaption className="mb-3">
        <h3 className="font-semibold text-white">{spec.title}</h3>
        <p className="text-xs text-white/55">{spec.subtitle}</p>
      </figcaption>
      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox="0 0 200 200" className="h-44 w-44 shrink-0 -rotate-90" role="img" aria-label={`${spec.title}: ${summary}`}>
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="26" />
          {spec.slices.map((s, i) => {
            const len = (s.value / total) * C;
            const seg = Math.max(0, len - GAP);
            const offset = -acc;
            acc += len;
            return (
              <motion.circle
                key={s.label}
                cx="100" cy="100" r={R} fill="none"
                stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
                strokeWidth={hot === i ? 32 : 26}
                strokeDasharray={`${seg} ${C - seg}`}
                strokeDashoffset={offset}
                initial={{ opacity: 0, strokeDasharray: `0 ${C}` }}
                animate={{ opacity: hot === null || hot === i ? 1 : 0.35, strokeDasharray: `${seg} ${C - seg}` }}
                transition={{ duration: 0.7, delay: i * 0.12 }}
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
              />
            );
          })}
          <g className="rotate-90" style={{ transformOrigin: "100px 100px" }}>
            <text x="100" y="96" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700">
              {hot === null ? "100%" : `${Math.round((spec.slices[hot].value / total) * 100)}%`}
            </text>
            <text x="100" y="116" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="11">
              {hot === null ? fmt(total) : fmt(spec.slices[hot].value)}
            </text>
          </g>
        </svg>
        <ul className="min-w-[200px] flex-1 space-y-2.5">
          {spec.slices.map((s, i) => (
            <li
              key={s.label}
              tabIndex={0}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              className={`flex items-start gap-2.5 rounded-xl px-2 py-1.5 outline-none transition ${hot === i ? "bg-white/10" : ""}`}
            >
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
              <span className="min-w-0 text-sm">
                <span className="block font-medium text-white">
                  {s.label} <span className="text-white/70">· {Math.round((s.value / total) * 100)}%</span>
                </span>
                <span className="block text-xs text-white/50">{fmt(s.value)} · {s.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-white/50">{spec.footnote}</p>
    </figure>
  );
}

export default function LeaderboardPage() {
  const { user, loading } = useRequireAuth();
  const [revenue, setRevenue] = useState(""); // annualised revenue, USD millions
  const [price, setPrice] = useState("3"); // blended USD per million tokens
  const [apiShare, setApiShare] = useState("70"); // % of revenue that is token-metered

  const rows = useMemo(() => [...LEADERBOARD].sort((a, b) => (b.tokensPerMonthT ?? -1) - (a.tokensPerMonthT ?? -1)), []);
  const max = Math.max(...rows.map((r) => r.tokensPerMonthT ?? 0));

  // tokens/month = (annual revenue × metered share / 12) ÷ price per million tokens
  const est = useMemo(() => {
    const r = parseFloat(revenue), p = parseFloat(price), s = parseFloat(apiShare);
    if (!(r > 0) || !(p > 0) || !(s > 0 && s <= 100)) return null;
    const monthlyUsd = ((r * 1e6 * (s / 100)) / 12);
    return (monthlyUsd / p) / 1e6; // trillions of tokens per month: (USD / (USD per M tokens)) = M tokens -> /1e6 = T tokens
  }, [revenue, price, apiShare]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <TopBar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-8 sm:px-6">
        <div>
          <p className="eyebrow">Market context</p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">LLM Leaderboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Which LLM provider processes the most tokens? Only some of it is public, so every row says how much to trust it. Compiled {LEADERBOARD_AS_OF}.
          </p>
        </div>

        <section className="liquid-glass rounded-[32px] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><PieChart className="h-[18px] w-[18px] text-white" /></span>
            <div>
              <h2 className="font-semibold text-white">At a glance</h2>
              <p className="text-sm text-white/60">Hover a slice or a legend row for exact figures.</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">{CHARTS.map((c) => <Donut key={c.id} spec={c} />)}</div>
        </section>

        <section className="liquid-glass rounded-[32px] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Trophy className="h-[18px] w-[18px] text-white" /></span>
            <h2 className="font-semibold text-white">Tokens processed per month</h2>
          </div>
          <ol className="space-y-4">
            {rows.map((r, i) => (
              <li key={r.company} className="rounded-2xl bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-ink-950">{i + 1}</span>
                  <h3 className="font-semibold text-white">{r.company}</h3>
                  <span className={`chip ${CONF[r.confidence].cls}`}>{CONF[r.confidence].label}</span>
                  <span className="ml-auto text-sm font-semibold text-white">{r.tokensPerMonthT === null ? "n/a" : fmtT(r.tokensPerMonthT)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <div className="h-full rounded-full bg-ember-400" style={{ width: r.tokensPerMonthT ? `${Math.max(2, (r.tokensPerMonthT / max) * 100)}%` : "0%" }} />
                </div>
                <p className="mt-2 text-sm text-white/75">{r.how}</p>
                <p className="mt-1 text-xs text-white/50">Scope: {r.scope} · As of {r.asOf}</p>
                {r.sources.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {r.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ember-200 underline decoration-white/20 underline-offset-2 hover:text-white">
                          <ExternalLink className="h-3 w-3" /> {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="liquid-glass rounded-[32px] p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Info className="h-[18px] w-[18px] text-white" /></span>
            <h2 className="font-semibold text-white">Read this before comparing rows</h2>
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/75">{CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>

        <section className="liquid-glass rounded-[32px] p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><Calculator className="h-[18px] w-[18px] text-white" /></span>
            <div>
              <h2 className="font-semibold text-white">Estimate an undisclosed provider</h2>
              <p className="text-sm text-white/60">tokens per month ≈ (annual revenue × metered share ÷ 12) ÷ blended price per million tokens</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-white/70">Annualised revenue (USD millions)
              <input className="input mt-1" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="e.g. 5000" />
            </label>
            <label className="text-sm text-white/70">Blended price (USD per million tokens)
              <input className="input mt-1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="text-sm text-white/70">Token-metered share of revenue (%)
              <input className="input mt-1" inputMode="decimal" value={apiShare} onChange={(e) => setApiShare(e.target.value)} />
            </label>
          </div>
          <p className="mt-4 text-sm text-white">
            {est === null ? <span className="text-white/50">Enter a revenue figure you trust to see an estimate.</span> : <>Estimated volume: <b>{fmtT(est)}</b> tokens per month (order of magnitude only).</>}
          </p>
        </section>
      </main>
    </div>
  );
}
