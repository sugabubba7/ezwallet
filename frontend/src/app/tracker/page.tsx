"use client";

import { ExternalLink, Loader2, Radar } from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { useRequireAuth } from "@/lib/auth";
import { COMPETITORS, COMPETITORS_CHECKED } from "@/lib/competitors";

export default function CompetitorsPage() {
  const { user, loading } = useRequireAuth();

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-950/50" />
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <TopBar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-8 sm:px-6">
        <div>
          <p className="eyebrow !text-ink-950/55">Competitors</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-950 sm:text-3xl">Top 5 competitors to Relay</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-950/65">
            Researched by hand from each company’s public site on {COMPETITORS_CHECKED}. Prices change, so re-check before relying on them. The live agent
            report is still available <Link href="/tracker/live" className="underline">here</Link>.
          </p>
        </div>

        {COMPETITORS.map((c, i) => (
          <section key={c.name} className="liquid-glass rounded-[32px] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-ink-950">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-center gap-2 font-semibold text-white">
                  {c.name}
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white" aria-label={`${c.name} website`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </h2>
                <p className="mt-1 text-sm italic text-white/80">{c.oneLiner}</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-2xl bg-black/20 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-white/50">Who it’s for</dt>
                <dd className="mt-1 text-white/80">{c.forWho}</dd>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-white/50">Pricing</dt>
                <dd className="mt-1 text-white/80">{c.pricing}</dd>
              </div>
              <div className="rounded-2xl bg-black/20 p-4 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-white/50">Features</dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-4 text-white/80">
                    {c.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-white/50">Privacy and data</dt>
                <dd className="mt-1 text-white/80">{c.privacy}</dd>
              </div>
              <div className="rounded-2xl bg-black/20 p-4">
                <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
                  <Radar className="h-3.5 w-3.5" /> How it relates to Relay
                </dt>
                <dd className="mt-1 text-white/80">{c.overlap}</dd>
              </div>
            </dl>
          </section>
        ))}
      </main>
    </div>
  );
}
