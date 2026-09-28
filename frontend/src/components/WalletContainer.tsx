"use client";

/**
 * The leather card-holder vault (mockup 1).
 *
 * Locked:   cards peek out of the pocket, blurred, labels only. Content is not
 *           even in the DOM because the server never sent it.
 * Unlocked: cards spring upward out of the pocket one after another.
 *           Content stays redacted until a card is hovered or focused, and it
 *           is swapped back to a fixed mask the moment the pointer leaves.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, EyeOff, Flame, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD_THEMES, CATEGORY_META, REDACTED } from "@/lib/cards";
import type { CardMeta, CardRevealed } from "@/lib/types";

const STEP = 78; // visible strip per card when unlocked
const LOCKED_STEP = 13; // peek offset per card when locked
const CARD_H = 176;
const POCKET_H = 290;
const NOTCH = 34; // depth of the pocket's scooped mouth
const TOP_PAD = 18;

const spring = { type: "spring" as const, stiffness: 170, damping: 22, mass: 0.9 };

type Props = {
  cards: CardMeta[];
  revealed: CardRevealed[] | null; // null = locked
  expiresAt: number | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onUnlockRequest: () => void;
  onLock: () => void;
  onAdd: () => void;
  onEdit: (card: CardRevealed) => void;
  onDelete: (card: CardRevealed) => void;
};

/** Pocket outline: rounded shoulders, a scooped mouth, deep rounded bottom. */
function pocketPath(w: number, h: number, i = 0) {
  const r = 22 - i * 0.6;
  const b = 70 - i;
  const shoulder = 46;
  const d = NOTCH - i * 0.3;
  const L = i,
    T = i,
    R = w - i,
    B = h - i;
  return [
    `M ${L} ${T + r}`,
    `Q ${L} ${T} ${L + r} ${T}`,
    `L ${L + shoulder} ${T}`,
    `C ${L + shoulder + 26} ${T}, ${L + shoulder + 20} ${T + d}, ${L + shoulder + 52} ${T + d}`,
    `L ${R - shoulder - 52} ${T + d}`,
    `C ${R - shoulder - 20} ${T + d}, ${R - shoulder - 26} ${T}, ${R - shoulder} ${T}`,
    `L ${R - r} ${T}`,
    `Q ${R} ${T} ${R} ${T + r}`,
    `L ${R} ${B - b}`,
    `Q ${R} ${B} ${R - b} ${B}`,
    `L ${L + b} ${B}`,
    `Q ${L} ${B} ${L} ${B - b}`,
    "Z",
  ].join(" ");
}

function useCountdown(expiresAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const s = Math.max(0, Math.round((expiresAt - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function WalletContainer(props: Props) {
  const { cards, revealed, expiresAt, selectedId, onSelect, onUnlockRequest, onLock, onAdd, onEdit, onDelete } = props;
  const unlocked = revealed !== null;
  const list: (CardMeta | CardRevealed)[] = unlocked ? revealed : cards;
  const n = list.length;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const countdown = useCountdown(unlocked ? expiresAt : null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Hide revealed text immediately whenever the vault locks.
  useEffect(() => {
    if (!unlocked) setHoverId(null);
  }, [unlocked]);

  const pocketY = TOP_PAD + (unlocked ? Math.max(n, 1) * STEP + 4 : Math.min(n, 3) * LOCKED_STEP + 30);
  const cardY = (i: number) => TOP_PAD + (unlocked ? i * STEP : Math.min(i, 3) * LOCKED_STEP + (i > 3 ? 0 : 0));
  const liftFor = (i: number) => Math.max(0, cardY(i) + CARD_H - (pocketY + NOTCH * 0.55)) + 10;
  const height = pocketY + POCKET_H;

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-[380px] select-none">
      <motion.div className="relative" animate={{ height }} initial={false} transition={spring}>
        {/* -------- Cards -------- */}
        {list.map((card, i) => {
          const theme = CARD_THEMES[card.color] ?? CARD_THEMES.ember;
          const Icon = (CATEGORY_META[card.category] ?? CATEGORY_META.other).icon;
          const isHover = unlocked && hoverId === card.id;
          const isSelected = unlocked && selectedId === card.id;
          const content = "content" in card ? card.content : null;
          const widthPct = Math.max(80, 94 - (n - 1 - i) * 3);

          return (
            <motion.div
              key={card.id}
              data-testid="wallet-card"
              className="absolute left-1/2 overflow-hidden rounded-[22px] shadow-card outline-none"
              style={{
                width: `${widthPct}%`,
                height: CARD_H,
                x: "-50%",
                top: 0,
                zIndex: isHover ? 40 : i + 1,
                background: theme.bg,
                cursor: unlocked ? "default" : "pointer",
              }}
              initial={false}
              animate={{
                y: cardY(i) - (isHover ? liftFor(i) : 0),
                filter: unlocked ? "blur(0px)" : "blur(1.6px)",
                scale: isHover ? 1.015 : 1,
              }}
              transition={{ ...spring, delay: isHover || hoverId !== null ? 0 : unlocked ? (n - 1 - i) * 0.06 : i * 0.03 }}
              tabIndex={unlocked ? 0 : -1}
              onPointerEnter={(e) => unlocked && e.pointerType === "mouse" && setHoverId(card.id)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setHoverId((h) => (h === card.id ? null : h))}
              onPointerUp={(e) => {
                if (!unlocked) return onUnlockRequest();
                if (e.pointerType !== "mouse") setHoverId((h) => (h === card.id ? null : card.id)); // tap to toggle on touch
              }}
              onFocus={() => unlocked && setHoverId(card.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverId((h) => (h === card.id ? null : h));
              }}
              aria-label={`${card.label} context card${unlocked ? "" : " (locked)"}`}
            >
              <div className="flex h-[74px] items-center gap-3 px-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: theme.iconBg }}>
                  <Icon className="h-5 w-5" style={{ color: theme.accent }} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold uppercase tracking-wide" style={{ color: theme.text }}>
                    {card.label}
                  </div>
                  <div
                    className={`truncate text-[12.5px] font-medium transition-[filter] duration-150 ${isHover ? "" : "tracking-[0.12em]"}`}
                    style={{ color: theme.sub, filter: isHover ? "none" : "blur(0.4px)" }}
                    data-testid="card-secret-line"
                  >
                    {isHover && content ? content : unlocked ? REDACTED : CATEGORY_META[card.category]?.label ?? "Context"}
                  </div>
                </div>
                {unlocked && (
                  <button
                    type="button"
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(isSelected ? null : card.id);
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:scale-110"
                    aria-pressed={isSelected}
                    aria-label={isSelected ? `Detach ${card.label} from prompt` : `Attach ${card.label} to prompt`}
                    title={isSelected ? "Attached to prompt" : "Attach to prompt"}
                  >
                    {isSelected ? (
                      <span className="grid h-7 w-7 place-items-center rounded-full border-2" style={{ borderColor: theme.accent }}>
                        <Check className="h-4 w-4" style={{ color: theme.accent }} strokeWidth={2.6} />
                      </span>
                    ) : (
                      <span className="h-7 w-7 rounded-full border-2 border-dashed" style={{ borderColor: theme.accent, opacity: 0.8 }} />
                    )}
                  </button>
                )}
              </div>

              {/* Body: only rendered with real text while revealed */}
              <div className={`px-5 pb-4 transition-opacity duration-150 ${isHover ? "opacity-100" : "opacity-0"}`}>
                <div
                  className="h-[62px] overflow-hidden rounded-xl px-3 py-2 text-[12.5px] leading-[1.45]"
                  style={{ background: "rgba(0,0,0,.07)", color: theme.text }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isHover && content ? (
                      <motion.p key="plain" className="line-clamp-3 break-words" initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                        {content}
                      </motion.p>
                    ) : (
                      <motion.p key="mask" className="select-none tracking-[0.2em] opacity-50 blur-[1.5px]" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                        {REDACTED} {REDACTED}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                {unlocked && content !== null && (
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={() => onEdit(card as CardRevealed)}
                      className="rounded-md p-1.5 transition hover:bg-black/10"
                      style={{ color: theme.sub }}
                      aria-label={`Edit ${card.label}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={() => onDelete(card as CardRevealed)}
                      className="rounded-md p-1.5 transition hover:bg-black/10"
                      style={{ color: theme.sub }}
                      aria-label={`Delete ${card.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* -------- Leather pocket -------- */}
        <motion.div
          className="absolute left-0 right-0 z-[60]"
          style={{ top: 0, height: POCKET_H }}
          initial={false}
          animate={{ y: pocketY }}
          transition={spring}
        >
          <svg width={width} height={POCKET_H} className="absolute inset-0 overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="leather-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d1612" />
                <stop offset="100%" stopColor="#120d0a" />
              </linearGradient>
              <radialGradient id="leather-sheen" cx="50%" cy="0%" r="80%">
                <stop offset="0%" stopColor="rgba(255,255,255,.07)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <filter id="leather-grain" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" />
                <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0" />
                <feComposite in2="SourceGraphic" operator="in" />
              </filter>
              <filter id="pocket-shadow" x="-10%" y="-20%" width="120%" height="140%">
                <feDropShadow dx="0" dy="-4" stdDeviation="6" floodColor="#000" floodOpacity=".35" />
                <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#000" floodOpacity=".35" />
              </filter>
            </defs>
            <path d={pocketPath(width, POCKET_H)} fill="url(#leather-fill)" filter="url(#pocket-shadow)" />
            <path d={pocketPath(width, POCKET_H)} fill="url(#leather-sheen)" />
            <path d={pocketPath(width, POCKET_H)} fill="#fff" filter="url(#leather-grain)" />
            <path d={pocketPath(width, POCKET_H, 9)} fill="none" stroke="#8a4a22" strokeOpacity=".75" strokeWidth="1.3" strokeDasharray="5 4" />
          </svg>

          <div className="relative flex h-full flex-col items-center px-8 text-center" style={{ paddingTop: NOTCH + 42 }}>
            <AnimatePresence mode="wait" initial={false}>
              {unlocked ? (
                <motion.div key="open" className="flex flex-col items-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Context cards unlocked</p>
                  <p className="mt-3 text-[26px] font-medium tabular-nums text-white/90">
                    {n} {n === 1 ? "card" : "cards"}
                    <span className="mx-2 text-white/25">·</span>
                    <span className="text-ember-400" title="Auto-locks when the timer ends">{countdown ?? "--:--"}</span>
                  </p>
                  <p className="mt-1 text-xs text-white/40">Hover a card to reveal it. Tap ◯ to attach it to your prompt.</p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={onAdd}
                      className="flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add card
                    </button>
                    <button
                      onClick={onLock}
                      className="grid h-12 w-12 place-items-center rounded-full bg-ink-900 shadow-glow transition hover:scale-105"
                      aria-label="Lock vault"
                      title="Lock vault"
                    >
                      <EyeOff className="h-5 w-5 text-ember-500" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="locked" className="flex flex-col items-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Sensitive context vault</p>
                  <button onClick={onUnlockRequest} className="mt-3 flex items-center gap-3 text-white/90" aria-label="Unlock vault with PIN">
                    <Lock className="h-7 w-7" strokeWidth={2} />
                    <span className="flex gap-[7px]" aria-hidden>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} className="h-[9px] w-[9px] rounded-full bg-white/85" />
                      ))}
                    </span>
                  </button>
                  <p className="mt-2 text-xs text-white/40">Enter PIN to unlock</p>
                  <button
                    onClick={onUnlockRequest}
                    className="mt-4 grid h-14 w-14 place-items-center rounded-full bg-ink-900 shadow-glow transition hover:scale-105"
                    aria-label="Reveal cards"
                    data-testid="unlock-eye"
                  >
                    <Eye className="h-5 w-5 text-ember-500" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <Flame className="mt-4 h-5 w-5 text-white/15" />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
