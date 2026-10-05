"use client";

/**
 * Chat archive: the selected session's card sits at the LEFT; older sessions stack straight back behind it
 * (blurred, fading with depth) and sessions already passed tuck away behind the front card, so nothing is ever
 * to the left of it. The right side summarises the selected session.
 * Only metadata is shown because only metadata is stored: when the chat happened, how many texts were
 * exchanged, which model answered and which context card was attached, never what was said.
 */
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { CalendarDays, Clock, Cpu, FastForward, Gauge, Layers, MessagesSquare, MoreHorizontal, Rewind, Sparkles, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Chat } from "@/lib/types";

type Props = {
  chats: Chat[];
  activeId?: number | null;
  onDelete: (chat: Chat) => void;
};

/** "gemini-2.5-flash" -> "Gemini 2.5 Flash" */
export function prettyModel(m: string) {
  return m
    .split(/[-_]/)
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Backend timestamps are UTC; SQLite drops the offset, so add it back. */
export function parseUtc(iso: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - parseUtc(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const textsLabel = (n: number) => `${n} ${n === 1 ? "text" : "texts"}`;

/** Which company's LLM answered, from the model id ("gemini-2.5-flash" -> "Google Gemini"). */
export function providerOf(model: string) {
  const m = model.toLowerCase();
  if (m.startsWith("gemini") || m.startsWith("gemma")) return "Google Gemini";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "OpenAI";
  if (m.startsWith("claude")) return "Anthropic Claude";
  if (m.startsWith("llama")) return "Meta Llama";
  return prettyModel(model.split(/[-_/]/)[0] || model);
}

/** "today", "yesterday", "6 days ago" (calendar days, in the viewer's time zone). */
export function daysAgo(iso: string) {
  const d = parseUtc(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const n = Math.max(0, Math.round((b - a) / 86_400_000));
  return n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

function when(iso: string) {
  const d = parseUtc(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); // "8:14 PM"
  const [clock, meridiem] = time.split(" ");
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return { clock, meridiem, date };
}

type Pose = { x: number; y: number; rotateY: number; scale: number; opacity: number; blur: number; brightness: number; zIndex: number };

/** offset 0 = front card (left). offset > 0 = older sessions stacked straight back. offset < 0 = already passed: tucked behind. */
function poseFor(offset: number): Pose {
  if (offset === 0) return { x: 0, y: 0, rotateY: 0, scale: 1, opacity: 1, blur: 0, brightness: 1, zIndex: 30 };
  if (offset < 0) return { x: 0, y: 0, rotateY: 14, scale: 0.88, opacity: 0, blur: 10, brightness: 0.5, zIndex: 5 };
  const k = Math.min(offset, 4);
  const depth = [0, { s: 0.93, o: 0.85, b: 0.8, br: 0.85 }, { s: 0.86, o: 0.55, b: 2.2, br: 0.72 }, { s: 0.8, o: 0.3, b: 4, br: 0.6 }, { s: 0.74, o: 0, b: 9, br: 0.5 }][k] as { s: number; o: number; b: number; br: number };
  return { x: k * 24, y: -k * 12, rotateY: -6, scale: depth.s, opacity: depth.o, blur: depth.b, brightness: depth.br, zIndex: 30 - k * 5 };
}

/** Small ring like the "Mindful" gauge in the inspiration. */
function Ring({ value }: { value: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] -rotate-90" aria-hidden>
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="3" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.max(0.06, value) * c} ${c}`} />
    </svg>
  );
}

function ChatCard({ chat, maxCount, focused }: { chat: Chat; maxCount: number; focused: boolean }) {
  const w = when(chat.created_at);
  const share = Math.min(1, chat.message_count / Math.max(1, maxCount));
  return (
    <div className="energy-card flex h-[304px] flex-col rounded-[30px] p-5 text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-medium text-white/85">{prettyModel(chat.model)}</span>
        {chat.is_sample && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] text-white/85">Sample</span>}
      </div>

      <h3 className="mt-3 line-clamp-2 text-[18px] font-semibold leading-snug">{chat.title}</h3>
      <p className="mt-1 truncate text-[12px] text-white/55">
        {chat.card_label ? `◈ ${chat.card_label}` : chat.tags.length ? chat.tags.map((t) => `#${t}`).join("  ") : "No context card"}
      </p>

      <div className="mt-auto">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[42px] font-semibold leading-none tracking-tight">{w.clock}</span>
          <span className="text-[15px] font-medium text-white/60">{w.meridiem}</span>
        </div>
        <p className="mt-1 text-[13px] text-white/65">{w.date}</p>

        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(255,255,255,.12), #fff)" }}
            initial={false}
            animate={{ width: `${Math.max(8, share * 100)}%` }}
            transition={{ duration: focused ? 0.6 : 0 }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <Ring value={share} />
          <span className="font-semibold">{chat.message_count}</span>
          <span className="text-white/60">texts exchanged</span>
        </div>
      </div>
    </div>
  );
}

export function CoverFlowSlider({ chats, activeId, onDelete }: Props) {
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const n = chats.length;
  const current = chats[Math.min(index, n - 1)];
  const maxCount = useMemo(() => chats.reduce((m, c) => Math.max(m, c.message_count), 0), [chats]);
  const totals = useMemo(
    () => ({ texts: chats.reduce((t, c) => t + c.message_count, 0), models: new Set(chats.map((c) => prettyModel(c.model))).size }),
    [chats],
  );

  // Focus a specific chat when asked (e.g. right after a new execution).
  useEffect(() => {
    if (activeId == null) return;
    const i = chats.findIndex((c) => c.id === activeId);
    if (i >= 0) setIndex(i);
  }, [activeId, chats]);

  useEffect(() => {
    if (index > n - 1) setIndex(Math.max(0, n - 1));
  }, [n, index]);

  const go = useCallback((d: number) => setIndex((i) => (n ? (i + d + n) % n : 0)), [n]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 50 || info.velocity.x > 400) go(-1);
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      className="relative flex h-full flex-col outline-none"
      aria-roledescription="carousel"
      aria-label="Chat session summaries"
    >
      <div className="flex items-center justify-between px-6 pt-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-white">
          <MessagesSquare className="h-4 w-4" /> Chat Archive
        </h2>
        <span className="chip bg-black/20 text-white/80">{n} sessions</span>
      </div>

      <div className="mt-5 grid flex-1 content-start gap-5 px-5 sm:px-7 md:max-lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]">
        {/* Stage: front card on the left, older sessions stacked straight back */}
        <motion.div
          className="relative h-[330px] w-[272px] cursor-grab touch-pan-y active:cursor-grabbing"
          style={{ perspective: 1100 }}
          drag={n > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragEnd={onDragEnd}
        >
          {n === 0 ? (
            <div className="absolute left-0 top-1 w-[244px]">
              <div className="energy-card flex h-[304px] flex-col items-center justify-center rounded-[30px] p-6 text-center text-white">
                <Sparkles className="h-9 w-9 text-white/80" />
                <div className="mt-4 text-[18px] font-semibold">No sessions yet</div>
                <div className="mt-1 text-[13px] text-white/65">Ask Gemini below to start your archive</div>
              </div>
            </div>
          ) : (
            chats.map((chat, i) => {
              const offset = i - index;
              if (offset > 4 || offset < -1) return null;
              const p = poseFor(offset);
              const isCenter = offset === 0;
              return (
                <motion.button
                  type="button"
                  key={chat.id}
                  data-testid="coverflow-card"
                  className="absolute left-0 top-3 w-[244px] text-left"
                  style={{ zIndex: p.zIndex, transformOrigin: "left center", pointerEvents: p.opacity < 0.1 ? "none" : "auto" }}
                  initial={false}
                  animate={{
                    x: p.x,
                    y: p.y,
                    rotateY: p.rotateY,
                    scale: p.scale,
                    opacity: p.opacity,
                    filter: `blur(${p.blur}px) brightness(${p.brightness})`,
                  }}
                  transition={{ type: "spring", stiffness: 210, damping: 28 }}
                  onClick={() => !isCenter && setIndex(i)}
                  aria-current={isCenter}
                  tabIndex={isCenter ? 0 : -1}
                  aria-label={`${chat.title}, ${textsLabel(chat.message_count)}`}
                >
                  <ChatCard chat={chat} maxCount={maxCount} focused={isCenter} />
                </motion.button>
              );
            })
          )}
        </motion.div>

        {/* Summary of the selected session */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current?.id ?? "none"}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="min-w-0"
          >
            <SessionSummary chat={current} count={n} totals={totals} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Control bar */}
      <div className="liquid-glass mx-3 mb-4 mt-5 flex items-center gap-2 rounded-[28px] px-3 py-2 sm:mx-5 sm:gap-3 sm:px-4">
        <div className="flex items-center gap-0.5 text-white">
          <CtrlBtn label="Previous session" onClick={() => go(-1)} disabled={n < 2}>
            <Rewind className="h-5 w-5" fill="currentColor" />
          </CtrlBtn>
          <CtrlBtn label="Next (older) session" onClick={() => go(1)} disabled={n < 2}>
            <FastForward className="h-5 w-5" fill="currentColor" />
          </CtrlBtn>
        </div>

        {/* details of the selected session */}
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-3 overflow-hidden rounded-2xl bg-ink-950/70 p-1.5 pr-2 ring-1 ring-white/10">
            <div className="energy-card grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-semibold text-white" title="Texts exchanged">
              {current ? current.message_count : "–"}
            </div>
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={current?.id ?? "none"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <div className="truncate text-[13px] font-medium text-white">{current?.title ?? "Nothing here yet"}</div>
                  {current ? (
                    <>
                      <div className="truncate text-[11px] text-white/65">
                        {when(current.created_at).date} · {textsLabel(current.message_count)} exchanged · {daysAgo(current.updated_at)}
                      </div>
                      <div className="truncate text-[11px] text-white/45">
                        {providerOf(current.model)} · {prettyModel(current.model)}
                      </div>
                    </>
                  ) : (
                    <div className="truncate text-[11px] text-white/55">Ask Gemini below to start</div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <button
              className="shrink-0 rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={!current}
              aria-label="Session options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="absolute bottom-0 left-2 right-2 h-[3px] overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-ember-300" animate={{ width: n ? `${((index + 1) / n) * 100}%` : "0%" }} />
          </div>
          <AnimatePresence>
            {menuOpen && current && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-full right-0 z-40 mb-2 w-64 rounded-2xl bg-ink-900 p-2 text-xs text-white/80 shadow-2xl ring-1 ring-white/10"
              >
                <div className="space-y-1.5 px-2 py-1.5">
                  <Meta label="Started" value={`${when(current.created_at).clock} ${when(current.created_at).meridiem} · ${when(current.created_at).date}`} />
                  <Meta label="Texts" value={String(current.message_count)} />
                  <Meta label="Last turn" value={current.prompt_tokens != null ? `${current.prompt_tokens} → ${current.output_tokens ?? 0} tokens` : "n/a"} />
                  <Meta label="Latency" value={current.latency_ms != null ? `${current.latency_ms} ms` : "n/a"} />
                </div>
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-ember-200 hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(current);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete summary
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="hidden min-w-[40px] text-center text-xs tabular-nums text-white/75 sm:block">{n ? `${index + 1}/${n}` : "0/0"}</span>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 truncate text-[15px] font-semibold text-white">{value}</div>
      {sub && <div className="truncate text-[12px] text-white/55">{sub}</div>}
    </div>
  );
}

/** Metadata-only summary of one session: what exists about it, never what was said. */
function SessionSummary({ chat, count, totals }: { chat?: Chat; count: number; totals: { texts: number; models: number } }) {
  if (!chat) {
    return (
      <div className="rounded-3xl bg-black/20 p-5 text-sm text-white/65">
        <p className="font-semibold text-white">Session summary</p>
        <p className="mt-1">Once you chat, each session&apos;s summary appears here.</p>
      </div>
    );
  }
  const w = when(chat.created_at);
  return (
    <div>
      <p className="eyebrow">Session summary</p>
      <h3 className="mt-1 line-clamp-2 text-xl font-semibold leading-snug text-white">{chat.title}</h3>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Stat icon={CalendarDays} label="Started" value={w.date} sub={`${w.clock} ${w.meridiem}`} />
        <Stat icon={Clock} label="Last active" value={daysAgo(chat.updated_at)} sub={timeAgo(chat.updated_at)} />
        <Stat icon={MessagesSquare} label="Texts exchanged" value={String(chat.message_count)} sub={chat.message_count > 2 ? "multi-turn conversation" : "single exchange"} />
        <Stat icon={Cpu} label="LLM" value={providerOf(chat.model)} sub={prettyModel(chat.model)} />
      </div>

      <div className="mt-2.5 rounded-2xl bg-black/20 p-3">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50">
          <Layers className="h-3.5 w-3.5" /> Memory used
        </div>
        <p className="mt-1 text-[14px] text-white">{chat.card_label ? `Context card: ${chat.card_label}` : "No context card attached"}</p>
        {chat.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chat.tags.map((t) => (
              <span key={t} className="chip bg-white/10 text-white/85">
                <Tag className="h-3 w-3" /> {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-black/20 px-3 py-2.5 text-[12px] text-white/70">
        <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Last turn: {chat.prompt_tokens != null ? `${chat.prompt_tokens} → ${chat.output_tokens ?? 0} tokens` : "n/a"}</span>
        <span>{chat.latency_ms != null ? `${(chat.latency_ms / 1000).toFixed(1)} s` : ""}</span>
      </div>
      <p className="mt-3 text-[12px] text-white/50">
        All {count} sessions: {totals.texts} texts across {totals.models} {totals.models === 1 ? "model" : "models"}. The wording of a chat is never stored, only these details.
      </p>
    </div>
  );
}

function CtrlBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 disabled:opacity-40">
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/45">{label}</span>
      <span className="ml-auto truncate text-right text-white/90">{value}</span>
    </div>
  );
}
