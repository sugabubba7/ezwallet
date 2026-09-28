"use client";

/**
 * Horizontal cover-flow of past chat sessions (mockup 2).
 * Only metadata is shown because only metadata is stored (ZDR).
 */
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  AudioWaveform,
  Cpu,
  FastForward,
  MessagesSquare,
  MoreHorizontal,
  Pause,
  Play,
  Rewind,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function timeAgo(iso: string) {
  const t = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").getTime();
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** Deterministic "album art" per chat: warm gradients + orbs. */
function artFor(chat: Chat) {
  const h = hash(chat.title + chat.id);
  const palettes = [
    ["#2b1408", "#b8461a", "#f6b25c"],
    ["#101826", "#3b72c4", "#f2c47a"],
    ["#1a0f22", "#8b3fa8", "#f59e6b"],
    ["#0f1f1a", "#1f7a55", "#e8d27a"],
    ["#26100c", "#c2412d", "#ffd28a"],
    ["#141414", "#e8702a", "#fbe3c2"],
  ];
  const [a, b, c] = palettes[h % palettes.length];
  const x = 20 + (h % 60);
  const y = 20 + ((h >> 5) % 60);
  return {
    background: `radial-gradient(circle at ${x}% ${y}%, ${c} 0%, ${b} 38%, ${a} 78%)`,
    orb: `radial-gradient(circle at 30% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 60%)`,
    orbPos: { left: `${(h >> 3) % 55}%`, top: `${(h >> 7) % 50}%` },
  };
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function positionFor(offset: number) {
  const abs = Math.abs(offset);
  const sign = Math.sign(offset);
  const x = abs === 0 ? 0 : sign * (150 + (abs - 1) * 92);
  return {
    x,
    rotateY: -sign * Math.min(abs, 1) * 38,
    scale: 1 - Math.min(abs, 3) * 0.1,
    z: -abs * 120,
    opacity: abs > 2 ? 0 : 1,
    zIndex: 10 - abs,
    filter: `blur(${abs >= 2 ? 1 : 0}px) brightness(${1 - abs * 0.14})`,
  };
}

export function CoverFlowSlider({ chats, activeId, onDelete }: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const n = chats.length;
  const current = chats[Math.min(index, n - 1)];

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

  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setInterval(() => go(1), 2600);
    return () => clearInterval(t);
  }, [playing, n, go]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 50 || info.velocity.x > 400) go(-1);
  };

  const art = useMemo(() => (current ? artFor(current) : null), [current]);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      className="relative flex h-full flex-col outline-none"
      aria-roledescription="carousel"
      aria-label="Chat session summaries"
    >
      {/* Header, in place of the mockup's Spotify mark */}
      <div className="flex items-center justify-center gap-2 pt-6 text-[#fbe3c2]/80">
        <MessagesSquare className="h-6 w-6" />
        <span className="text-xl font-semibold tracking-tight">Chat Archive</span>
      </div>

      {/* Stage */}
      <motion.div
        className="relative mx-auto mt-6 h-[330px] w-full cursor-grab touch-pan-y active:cursor-grabbing"
        style={{ perspective: 1100 }}
        drag={n > 1 ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
      >
        {n === 0 ? (
          <div className="absolute left-1/2 top-2 w-[230px] -translate-x-1/2">
            <div className="glass rounded-[26px] p-3 shadow-2xl">
              <div className="grid aspect-square place-items-center rounded-[18px] border border-dashed border-white/30 bg-black/10">
                <Sparkles className="h-10 w-10 text-white/60" />
              </div>
              <div className="px-1 pb-1 pt-3 text-center">
                <div className="font-semibold text-white/90">No sessions yet</div>
                <div className="text-xs text-white/60">Run a prompt below to start your archive</div>
              </div>
            </div>
          </div>
        ) : (
          chats.map((chat, i) => {
            let offset = i - index;
            // shortest way round so the loop looks continuous
            if (n > 4) {
              if (offset > n / 2) offset -= n;
              if (offset < -n / 2) offset += n;
            }
            if (Math.abs(offset) > 3) return null;
            const p = positionFor(offset);
            const a = artFor(chat);
            const isCenter = offset === 0;
            return (
              <motion.button
                type="button"
                key={chat.id}
                data-testid="coverflow-card"
                className="absolute left-1/2 top-0 w-[230px] text-left"
                style={{ zIndex: p.zIndex, marginLeft: -115, transformStyle: "preserve-3d" }}
                initial={false}
                animate={{ x: p.x, rotateY: p.rotateY, scale: p.scale, z: p.z, opacity: p.opacity, filter: p.filter }}
                transition={{ type: "spring", stiffness: 210, damping: 26 }}
                onClick={() => !isCenter && setIndex(i)}
                aria-current={isCenter}
                aria-label={`${chat.title}, ${prettyModel(chat.model)}`}
              >
                <div
                  className={`rounded-[26px] border border-white/25 bg-[#b0662a]/85 p-3 backdrop-blur-xl ${isCenter ? "shadow-[0_30px_60px_-15px_rgba(0,0,0,.55)]" : "shadow-xl"}`}
                  style={{ borderColor: isCenter ? "rgba(255,230,200,.45)" : undefined }}
                >
                  <div className="relative aspect-square overflow-hidden rounded-[18px]" style={{ background: a.background }}>
                    <div className="absolute h-28 w-28 rounded-full blur-md" style={{ background: a.orb, ...a.orbPos }} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,0,0,.45),transparent_60%)]" />
                    <span className="absolute left-3 top-3 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
                      {prettyModel(chat.model)}
                    </span>
                    {chat.is_sample && (
                      <span className="absolute right-3 top-3 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">Sample</span>
                    )}
                    <span className="absolute bottom-3 left-4 text-5xl font-black tracking-tighter text-white/90 drop-shadow-lg">{initials(chat.title)}</span>
                    {chat.card_label && (
                      <span className="absolute bottom-4 right-3 max-w-[110px] truncate rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-[#fbe3c2] backdrop-blur" title={`Context card: ${chat.card_label}`}>
                        ◈ {chat.card_label}
                      </span>
                    )}
                  </div>
                  <div className="px-1 pb-1 pt-3 text-center">
                    <div className="truncate text-[17px] font-semibold text-white/95">{chat.title}</div>
                    <div className="truncate text-[12.5px] text-white/65">{prettyModel(chat.model)}</div>
                    <div className={`mt-2 flex h-5 justify-center gap-1 overflow-hidden transition-opacity ${isCenter ? "opacity-100" : "opacity-0"}`}>
                      {chat.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] text-white/85">#{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </motion.div>

      {/* Control bar */}
      <div className="glass mx-3 mb-3 mt-auto flex items-center gap-2 rounded-full px-3 py-2.5 sm:mx-5 sm:gap-3 sm:px-5">
        <div className="flex items-center gap-1 text-white/85">
          <CtrlBtn label="Previous session" onClick={() => go(-1)} disabled={n < 2}>
            <Rewind className="h-5 w-5" fill="currentColor" />
          </CtrlBtn>
          <CtrlBtn label={playing ? "Pause autoplay" : "Autoplay"} onClick={() => setPlaying((p) => !p)} disabled={n < 2}>
            {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
          </CtrlBtn>
          <CtrlBtn label="Next session" onClick={() => go(1)} disabled={n < 2}>
            <FastForward className="h-5 w-5" fill="currentColor" />
          </CtrlBtn>
        </div>

        {/* now-playing pill */}
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-3 overflow-hidden rounded-2xl bg-[#1f1a17]/85 p-1.5 pr-2 ring-1 ring-white/5">
            <div className="h-10 w-10 shrink-0 rounded-lg" style={{ background: art?.background ?? "rgba(255,255,255,.08)" }} />
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={current?.id ?? "none"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  <div className="truncate text-[13px] font-medium text-white">{current?.title ?? "Nothing here yet"}</div>
                  <div className="truncate text-[11px] text-white/50">
                    {current ? `${prettyModel(current.model)} · ${timeAgo(current.created_at)}` : "Metadata only"}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            <AudioWaveform className="hidden h-4 w-4 shrink-0 text-white/40 sm:block" />
            <button
              className="shrink-0 rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={!current}
              aria-label="Session options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="absolute bottom-0 left-2 right-2 h-[3px] overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-white/80" animate={{ width: n ? `${((index + 1) / n) * 100}%` : "0%" }} />
          </div>
          <AnimatePresence>
            {menuOpen && current && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-full right-0 z-20 mb-2 w-60 rounded-xl bg-[#1f1a17] p-2 text-xs text-white/75 shadow-2xl ring-1 ring-white/10"
              >
                <div className="space-y-1.5 px-2 py-1.5">
                  <Meta icon={Cpu} label="Tokens" value={current.prompt_tokens != null ? `${current.prompt_tokens} in · ${current.output_tokens ?? 0} out` : "n/a"} />
                  <Meta icon={Timer} label="Latency" value={current.latency_ms != null ? `${current.latency_ms} ms` : "n/a"} />
                  <Meta icon={ShieldCheck} label="Stored" value="Title, tags, metrics" />
                </div>
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-red-300 hover:bg-red-500/10"
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

        <div className="hidden items-center gap-1 text-white/80 sm:flex">
          <span className="grid h-9 w-9 place-items-center" title="Zero data retention: prompts and outputs are never stored">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="min-w-[44px] text-center text-xs tabular-nums text-white/70">{n ? `${index + 1}/${n}` : "0/0"}</span>
        </div>
      </div>
      <p className="pb-4 text-center text-[11px] text-white/55">Metadata only · zero data retention</p>
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

function Meta({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-white/40" />
      <span className="text-white/45">{label}</span>
      <span className="ml-auto text-white/85">{value}</span>
    </div>
  );
}
