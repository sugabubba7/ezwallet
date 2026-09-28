"use client";

/**
 * Gemini console styled after the "Search or Ask" palette: a smoky
 * liquid-glass prompt pill above a glass list of commands, here the context
 * cards you can attach (⌥1…⌥9).
 *
 * The running conversation lives ONLY in this component's state. Each turn
 * re-sends it to the proxy, which forwards it to Gemini and stores nothing but
 * the session's metadata (title, tags, message count, timestamps).
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, Hash, Loader2, Lock, PenLine, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, errMsg } from "@/lib/api";
import { CARD_THEMES, CATEGORY_META } from "@/lib/cards";
import type { CardRevealed, Chat, LlmStatus } from "@/lib/types";
import { prettyModel, textsLabel } from "./CoverFlowSlider";

type ExecuteRes = { output: string; model: string; chat: Chat; retention: string };
type Turn = { role: "user" | "model"; text: string };

type Props = {
  llm: LlmStatus | null;
  cards: CardRevealed[] | null; // null = vault locked
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onUnlockRequest: () => void;
  onVaultLocked: () => void;
  onChatUpdated: (chat: Chat) => void;
};

export function LlmConsole({ llm, cards, selectedId, onSelect, onUnlockRequest, onVaultLocked, onChatUpdated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Turn[]>([]);
  const [session, setSession] = useState<Chat | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadBox = useRef<HTMLDivElement>(null);

  const selected = cards?.find((c) => c.id === selectedId) ?? null;

  // ⌥1…⌥9 toggles the matching context card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !cards) return;
      const n = Number(e.code.replace("Digit", ""));
      if (!Number.isInteger(n) || n < 1 || n > Math.min(9, cards.length)) return;
      e.preventDefault();
      const id = cards[n - 1].id;
      onSelect(selectedId === id ? null : id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, selectedId, onSelect]);

  // Keep the newest message in view by scrolling the thread box only, never the page.
  useEffect(() => {
    const box = threadBox.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [thread.length, busy]);

  // auto-grow the prompt pill
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [prompt]);

  const newChat = () => {
    setThread([]); // drops the transcript from memory
    setSession(null);
    setError(null);
    inputRef.current?.focus();
  };

  const run = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<ExecuteRes>("/llm/execute", {
        method: "POST",
        body: {
          prompt: text,
          card_id: selected?.id ?? null,
          chat_id: session?.id ?? null,
          history: thread,
          title: session ? null : title.trim() || null,
          tags: session ? [] : tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
        },
      });
      setThread((t) => [...t, { role: "user", text }, { role: "model", text: res.output }]);
      setSession(res.chat);
      setPrompt("");
      setTitle("");
      setTags("");
      onChatUpdated(res.chat);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && selected) onVaultLocked();
      if (e instanceof ApiError && e.status === 404 && session) newChat(); // session deleted meanwhile
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const theme = selected ? CARD_THEMES[selected.color] : null;

  return (
    <section aria-label="Ask Gemini">
      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-white">
          <Sparkles className="h-4 w-4" /> Gemini ZDR proxy
        </h2>
        <span className="chip bg-black/20 text-white/85">
          <ShieldCheck className="h-3.5 w-3.5" /> Prompts &amp; replies never stored
        </span>
        {session && (
          <button onClick={newChat} className="chip ml-auto bg-white/15 text-white transition hover:bg-white/25">
            <Plus className="h-3.5 w-3.5" /> New chat
          </button>
        )}
      </div>

      {llm && !llm.configured && (
        <p className="note-error mb-3">
          Gemini isn&apos;t configured yet. Add GEMINI_API_KEY to backend/.env and restart the API.
        </p>
      )}

      {/* Conversation (this tab only) */}
      <AnimatePresence initial={false}>
        {(thread.length > 0 || busy) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="liquid-glass mb-3 rounded-[32px] p-4 sm:p-5"
          >
            {session && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
                <span className="font-semibold text-white">{session.title}</span>
                <span>{textsLabel(session.message_count)}</span>
                <span>{prettyModel(session.model)}</span>
                {session.latency_ms != null && <span>{session.latency_ms} ms</span>}
                <span className="ml-auto">Lives in this tab only</span>
              </div>
            )}
            <div ref={threadBox} className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
              {thread.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-white/15 px-4 py-2.5 text-[14.5px] text-white">
                    {t.text}
                  </div>
                ) : (
                  <div key={i} className="max-w-[92%] whitespace-pre-wrap rounded-3xl rounded-bl-lg bg-ink-950/45 px-4 py-3 text-[14.5px] leading-relaxed text-white/95">
                    {t.text}
                  </div>
                ),
              )}
              {busy && (
                <div className="flex w-fit items-center gap-1.5 rounded-3xl bg-ink-950/45 px-4 py-3" aria-label="Gemini is thinking">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-white" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt pill */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="liquid-glass liquid-glass-deep flex items-end gap-3 rounded-[34px] py-3 pl-6 pr-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          className="max-h-[180px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[20px] font-light text-white caret-ember-300 outline-none placeholder:text-white/45 sm:text-[22px]"
          placeholder={session ? "Reply…" : "Search or Ask Gemini"}
          value={prompt}
          maxLength={16000}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
          aria-label="Prompt"
        />
        {selected && theme && (
          <span className="mb-2 hidden max-w-[160px] items-center gap-1.5 truncate rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold sm:flex" style={{ background: theme.bg, color: theme.text }}>
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.iconBg }} />
            <span className="truncate">{selected.label}</span>
          </span>
        )}
        <button
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-ink-950 shadow-[0_8px_20px_-8px_rgba(0,0,0,.6)] transition hover:bg-ember-50 disabled:bg-white/25 disabled:text-white/50"
          disabled={busy || !prompt.trim()}
          aria-label="Execute"
          title="Send (Enter)"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.4} />}
        </button>
      </form>

      {error && <p className="note-error mt-3" role="alert">{error}</p>}

      {/* Command list */}
      <div className="liquid-glass mt-3 rounded-[32px] px-3 py-3 sm:px-4">
        {cards === null ? (
          <Row icon={<Lock className="h-5 w-5" />} label="Unlock vault to attach context" hint="PIN" onClick={onUnlockRequest} />
        ) : cards.length === 0 ? (
          <Row icon={<Lock className="h-5 w-5" />} label="No context cards yet. Add one in your Data Pocket" hint="" />
        ) : (
          cards.map((c, i) => {
            const t = CARD_THEMES[c.color];
            const Icon = CATEGORY_META[c.category].icon;
            const on = c.id === selectedId;
            return (
              <Row
                key={c.id}
                icon={
                  <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: t.bg }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: t.accent }} />
                  </span>
                }
                label={c.label}
                sub={on ? "Attached to your next message" : CATEGORY_META[c.category].label}
                hint={i < 9 ? `⌥${i + 1}` : ""}
                active={on}
                onClick={() => onSelect(on ? null : c.id)}
              />
            );
          })
        )}

        {!session && (
          <div className="mt-1 grid gap-1 border-t border-white/10 pt-2 sm:grid-cols-2">
            <label className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition focus-within:bg-white/10">
              <PenLine className="h-5 w-5 shrink-0 text-white" />
              <input className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/50" placeholder="Session title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Session title" />
            </label>
            <label className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition focus-within:bg-white/10">
              <Hash className="h-5 w-5 shrink-0 text-white" />
              <input className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/50" placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" />
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  icon,
  label,
  sub,
  hint,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  hint: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition enabled:hover:bg-white/10 ${active ? "bg-white/15" : ""}`}
    >
      <span className="grid w-7 shrink-0 place-items-center text-white">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium text-white">{label}</span>
        {sub && <span className="block truncate text-xs text-white/55">{sub}</span>}
      </span>
      {active ? (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-ink-950">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="text-[15px] tabular-nums text-white/55">{hint}</span>
      )}
    </button>
  );
}
