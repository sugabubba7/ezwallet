"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, CornerDownLeft, Cpu, Loader2, Lock, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { ApiError, api, errMsg } from "@/lib/api";
import { CARD_THEMES, CATEGORY_META } from "@/lib/cards";
import type { CardRevealed, Chat, LlmStatus } from "@/lib/types";
import { prettyModel } from "./CoverFlowSlider";

type ExecuteRes = { output: string; model: string; chat: Chat; retention: string };

type Props = {
  llm: LlmStatus | null;
  selectedCard: CardRevealed | null;
  vaultUnlocked: boolean;
  onDetach: () => void;
  onVaultLocked: () => void;
  onExecuted: (chat: Chat) => void;
};

export function LlmConsole({ llm, selectedCard, vaultUnlocked, onDetach, onVaultLocked, onExecuted }: Props) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExecuteRes | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<ExecuteRes>("/llm/execute", {
        method: "POST",
        body: {
          prompt,
          card_id: selectedCard?.id ?? null,
          title: title.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
        },
      });
      setResult(res);
      setPrompt("");
      setTitle("");
      setTags("");
      onExecuted(res.chat);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && selectedCard) onVaultLocked();
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const theme = selectedCard ? CARD_THEMES[selectedCard.color] : null;
  const CardIcon = selectedCard ? CATEGORY_META[selectedCard.category].icon : null;

  return (
    <section className="glass-dark rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ember-500/15">
          <Sparkles className="h-5 w-5 text-ember-400" />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold">Gemini ZDR Proxy</h2>
          <p className="text-xs text-white/45">
            <code className="text-white/60">POST /api/v1/llm/execute</code> → {llm?.endpoint ?? "generativelanguage.googleapis.com"}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Prompt &amp; output never stored
        </span>
      </div>

      {llm && !llm.configured && (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Gemini isn&apos;t configured yet. Add <code className="font-mono">GEMINI_API_KEY</code> to <code className="font-mono">backend/.env</code> and restart the API.
        </p>
      )}

      {/* Context card chip */}
      <div className="mt-5">
        <span className="mb-2 block text-xs font-medium text-white/50">Context card</span>
        {selectedCard && theme && CardIcon ? (
          <div className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2 shadow-card" style={{ background: theme.bg }}>
            <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: theme.iconBg }}>
              <CardIcon className="h-3.5 w-3.5" style={{ color: theme.accent }} />
            </span>
            <span className="text-sm font-semibold" style={{ color: theme.text }}>{selectedCard.label}</span>
            <button onClick={onDetach} className="rounded-full p-1 hover:bg-black/10" style={{ color: theme.sub }} aria-label="Detach context card">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-white/40">
            <Lock className="h-3.5 w-3.5" />
            {vaultUnlocked ? "No card attached. Tap ◯ on a wallet card to attach it." : "Unlock your vault to attach a context card (optional)."}
          </p>
        )}
      </div>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <textarea
          className="input min-h-[110px] resize-y"
          placeholder="Ask Gemini anything… (⌘/Ctrl + Enter to run)"
          value={prompt}
          maxLength={16000}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
          }}
          aria-label="Prompt"
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Session title (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Session title" />
          <input className="input" placeholder="Tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" />
          <button className="btn-primary sm:min-w-[140px]" disabled={busy || !prompt.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />} Execute
          </button>
        </div>
      </form>

      {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">{error}</p>}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
              <Cpu className="h-3.5 w-3.5" /> {prettyModel(result.model)}
              {result.chat.prompt_tokens != null && <span>· {result.chat.prompt_tokens} → {result.chat.output_tokens} tokens</span>}
              {result.chat.latency_ms != null && <span>· {result.chat.latency_ms} ms</span>}
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">retention: {result.retention}</span>
              <div className="ml-auto flex gap-1">
                <button
                  className="rounded-md p-1.5 hover:bg-white/10 hover:text-white"
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.output);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                  aria-label="Copy response"
                >
                  {copied ? "Copied" : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button className="rounded-md p-1.5 hover:bg-white/10 hover:text-white" onClick={() => setResult(null)} aria-label="Discard response">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/90">{result.output}</div>
            <p className="mt-3 text-[11px] text-white/35">This response only exists in this browser tab. Close it and it&apos;s gone.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
