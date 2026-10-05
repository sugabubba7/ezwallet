"use client";

import { AlertTriangle, ArrowDownRight, CheckCircle2, Clock, ExternalLink, FileText, History, Loader2, Newspaper, Radar, Repeat } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { ApiError, api, errMsg } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { TrackerArticle, TrackerDevelopment, TrackerRunDetail, TrackerRunSummary } from "@/lib/types";

/*
 * SECURITY: every string on this page originates from untrusted web pages (titles, summaries, quotes, URLs).
 * It is only ever rendered as React text children, which React escapes. There is no dangerouslySetInnerHTML
 * and no markdown/HTML renderer. Links are only made for http(s) URLs, so a stored `javascript:` URL
 * is shown as plain text instead of becoming a clickable script.
 */
const isHttp = (u: string) => /^https?:\/\//i.test(u);

function SafeLink({ url, children }: { url: string; children?: React.ReactNode }) {
  if (!isHttp(url)) return <span className="break-all text-white/60">{children ?? url}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-ember-200 underline decoration-white/20 underline-offset-2 hover:text-white">
      {children ?? url}
    </a>
  );
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 40);
  }
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "…");

const STATUS_STYLE: Record<string, string> = {
  complete: "bg-white/15 text-white",
  partial: "bg-amber-400/20 text-amber-100",
  failed: "bg-ember-600/40 text-ember-100",
  running: "bg-white/10 text-white/70",
  fetched: "bg-white/15 text-white",
  skipped: "bg-white/10 text-white/60",
  rejected: "bg-ember-600/40 text-ember-100",
};
const ARTICLE_LABEL: Record<string, string> = { fetched: "fetched", skipped: "skipped (already seen)", rejected: "rejected by guardrail", failed: "failed" };

function Chip({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`chip ${STATUS_STYLE[kind] ?? "bg-white/10 text-white/70"}`}>{children}</span>;
}

function Panel({ icon: Icon, title, desc, children }: { icon: typeof Radar; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="liquid-glass rounded-[32px] p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
          <Icon className="h-[18px] w-[18px] text-white" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-white">{title}</h2>
          {desc && <p className="text-sm text-white/60">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Development({ d }: { d: TrackerDevelopment }) {
  return (
    <li className="rounded-2xl bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-ink-950">{d.rank}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">{d.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{d.summary}</p>
          <ul className="mt-3 space-y-2">
            {d.sources.map((s) => (
              <li key={s.url} className="text-sm">
                <div className="flex items-start gap-1.5">
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/50" />
                  <SafeLink url={s.url}>{s.title ? `${s.title} · ${host(s.url)}` : s.url}</SafeLink>
                </div>
                {s.quote && <blockquote className="ml-5 mt-1 border-l-2 border-white/20 pl-3 text-xs italic text-white/55">“{s.quote}”</blockquote>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

function Section({ title, icon: Icon, items, empty }: { title: string; icon: typeof Radar; items: TrackerDevelopment[]; empty: string }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/70">
        <Icon className="h-4 w-4" /> {title} <span className="text-white/40">({items.length})</span>
      </h3>
      {items.length ? <ul className="space-y-3">{items.map((d) => <Development key={d.id} d={d} />)}</ul> : <p className="text-sm text-white/45">{empty}</p>}
    </div>
  );
}

export default function TrackerPage() {
  const { user, loading } = useRequireAuth();
  const [runs, setRuns] = useState<TrackerRunSummary[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<TrackerRunDetail | null>(null);
  const [articles, setArticles] = useState<TrackerArticle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMd, setShowMd] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const list = await api<TrackerRunSummary[]>("/tracker/runs");
      setRuns(list);
      setSelected((cur) => cur ?? list.find((r) => r.status !== "running")?.id ?? null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    if (user) void loadRuns();
  }, [user, loadRuns]);

  useEffect(() => {
    if (selected === null) return;
    let live = true;
    setDetail(null);
    setArticles(null);
    Promise.all([api<TrackerRunDetail>(`/tracker/runs/${selected}`), api<TrackerArticle[]>(`/tracker/runs/${selected}/articles`)])
      .then(([d, a]) => {
        if (live) {
          setDetail(d);
          setArticles(a);
        }
      })
      .catch((e) => live && setError(e instanceof ApiError && e.status === 401 ? "Session expired. Please log in again." : errMsg(e)));
    return () => {
      live = false;
    };
  }, [selected]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </main>
    );
  }

  const latestId = runs?.find((r) => r.status !== "running")?.id;
  const isLatest = detail?.id === latestId;
  const news = detail?.developments.filter((d) => d.section === "new") ?? [];
  const still = detail?.developments.filter((d) => d.section === "still") ?? [];

  return (
    <div className="min-h-screen overflow-x-hidden">
      <TopBar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-8 sm:px-6">
        <div>
          <p className="eyebrow">Agentic tracker</p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Current competitors to EZ Wallet</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            A research agent searches the web, ranks the top developments and remembers what it has already seen, so each run reports only what changed.
          </p>
        </div>

        {error && <p className="note-error" role="alert">{error}</p>}

        {runs === null && !error && (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-white/50" />
          </div>
        )}

        {runs !== null && runs.length === 0 && (
          <Panel icon={Radar} title="No runs yet" desc="The tracker has not reported anything for this account.">
            <p className="text-sm text-white/70">
              Run <code className="rounded bg-black/30 px-1.5 py-0.5">python -m tracker run</code> from the repository root. The report appears here when it finishes.
            </p>
          </Panel>
        )}

        {detail && (
          <Panel
            icon={Newspaper}
            title={isLatest ? "Latest report" : `Report for run #${detail.id}`}
            desc={`Top ${detail.k} developments · ${fmt(detail.finished_at ?? detail.started_at)}`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Chip kind={detail.status}>
                {detail.status === "complete" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {detail.status}
              </Chip>
              <Chip kind="skipped">{detail.new_count} new</Chip>
              <Chip kind="skipped">{detail.still_count} still in top {detail.k}</Chip>
              <Chip kind="skipped">{detail.dropped_count} dropped</Chip>
            </div>
            {detail.status !== "complete" && (
              <p className="note-error mb-4">
                Partial report{detail.partial_reason ? `: ${detail.partial_reason}` : "."} The run stopped early; only the evidence gathered so far is shown.
              </p>
            )}
            <Section title="New since last run" icon={Radar} items={news} empty="Nothing new made the top K." />
            <Section title="Still in top K" icon={Repeat} items={still} empty="Nothing carried over from the previous run." />
            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/70">
                <ArrowDownRight className="h-4 w-4" /> Dropped <span className="text-white/40">({detail.dropped.length})</span>
              </h3>
              {detail.dropped.length ? (
                <ul className="space-y-1 text-sm text-white/75">
                  {detail.dropped.map((d) => (
                    <li key={d.id}>· {d.title}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-white/45">Nothing dropped.</p>
              )}
            </div>
            {detail.report_md && (
              <div className="mt-5">
                <button className="btn-ghost" onClick={() => setShowMd((v) => !v)}>
                  <FileText className="h-4 w-4" /> {showMd ? "Hide" : "Show"} raw markdown report
                </button>
                {showMd && <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-black/30 p-4 text-xs text-white/75">{detail.report_md}</pre>}
              </div>
            )}
          </Panel>
        )}

        {runs !== null && runs.length > 0 && (
          <Panel icon={History} title="Run history" desc="Select a run to see its report and the articles it looked at.">
            <ul className="space-y-2">
              {runs.map((r) => {
                const tokens = Number(r.stats?.prompt_tokens ?? 0) + Number(r.stats?.output_tokens ?? 0);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r.id)}
                      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-left text-sm transition ${
                        r.id === selected ? "bg-white/20 text-white" : "bg-black/20 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      <span className="font-semibold">Run #{r.id}</span>
                      <span className="flex items-center gap-1 text-white/60">
                        <Clock className="h-3.5 w-3.5" /> {fmt(r.started_at)}
                      </span>
                      <Chip kind={r.status}>{r.status}</Chip>
                      <span className="text-white/70">
                        +{r.new_count} new · {r.still_count} still · −{r.dropped_count} dropped
                      </span>
                      <span className="ml-auto text-xs text-white/45">
                        {r.article_counts.fetched} fetched · {r.article_counts.skipped} skipped · {r.article_counts.rejected} rejected
                        {tokens ? ` · ${tokens.toLocaleString()} tokens` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {selected !== null && (
          <Panel icon={FileText} title={`Articles in run #${selected}`} desc="Every URL the agent tried, and what happened to it.">
            {articles === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-white/50" />
            ) : articles.length === 0 ? (
              <p className="text-sm text-white/45">This run did not try any article.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Title</th>
                      <th className="py-2 pr-3 font-medium">URL</th>
                      <th className="py-2 pr-3 font-medium">Fetched at</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 align-top">
                    {articles.map((a) => (
                      <tr key={a.id}>
                        <td className="max-w-[220px] py-2 pr-3 text-white/90">{a.title || <span className="text-white/40">(no title)</span>}</td>
                        <td className="max-w-[280px] py-2 pr-3">
                          <SafeLink url={a.url} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-white/60">{fmt(a.fetched_at)}</td>
                        <td className="py-2">
                          <Chip kind={a.status}>{ARTICLE_LABEL[a.status] ?? a.status}</Chip>
                          {a.reason && <div className="mt-1 max-w-[240px] text-xs text-white/45">{a.reason}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </main>
    </div>
  );
}
