"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CARD_COLORS, CARD_THEMES, CATEGORIES, CATEGORY_META } from "@/lib/cards";
import type { CardColor, CardRevealed, Category } from "@/lib/types";
import { Modal } from "./Modal";

export type CardDraft = { label: string; category: Category; color: CardColor; content: string };

type Props = {
  open: boolean;
  initial?: CardRevealed | null;
  onClose: () => void;
  onSave: (draft: CardDraft) => Promise<void>;
};

export function CardEditorModal({ open, initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CardDraft>({ label: "", category: "personal", color: "ember", content: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      initial
        ? { label: initial.label, category: initial.category, color: initial.color, content: initial.content }
        : { label: "", category: "personal", color: "ember", content: "" },
    );
  }, [open, initial]);

  const theme = CARD_THEMES[draft.color];
  const Icon = CATEGORY_META[draft.category].icon;

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit context card" : "New context card"} width="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSave({ ...draft, label: draft.label.trim(), content: draft.content.trim() });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save card");
          } finally {
            setBusy(false);
          }
        }}
      >
        {/* Live preview */}
        <div className="flex h-[74px] items-center gap-3 rounded-2xl px-5 shadow-card" style={{ background: theme.bg }}>
          <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: theme.iconBg }}>
            <Icon className="h-5 w-5" style={{ color: theme.accent }} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold uppercase tracking-wide" style={{ color: theme.text }}>
              {draft.label || "Card label"}
            </div>
            <div className="text-xs font-medium" style={{ color: theme.sub }}>
              {CATEGORY_META[draft.category].label} · encrypted
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="card-label" className="mb-1.5 block text-xs font-medium text-white/55">Label</label>
          <input id="card-label" className="input" maxLength={80} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Writing voice" required />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/55">Category</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const M = CATEGORY_META[c];
              const on = draft.category === c;
              return (
                <button
                  type="button"
                  key={c}
                  onClick={() => setDraft({ ...draft, category: c })}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    on ? "bg-ember-500 text-white" : "bg-white/[0.07] text-white/65 hover:text-white"
                  }`}
                >
                  <M.icon className="h-3.5 w-3.5" /> {M.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/55">Card skin</span>
          <div className="flex gap-2.5">
            {CARD_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                onClick={() => setDraft({ ...draft, color: c })}
                className={`grid h-8 w-8 place-items-center rounded-full ring-2 transition ${draft.color === c ? "ring-ember-500" : "ring-transparent hover:ring-white/30"}`}
                style={{ background: CARD_THEMES[c].bg }}
              >
                {draft.color === c && <Check className="h-4 w-4" style={{ color: CARD_THEMES[c].accent }} />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="card-content" className="mb-1.5 block text-xs font-medium text-white/55">
            Sensitive context <span className="text-white/30">(encrypted at rest, sent to Gemini only when attached)</span>
          </label>
          <textarea
            id="card-content"
            className="input min-h-[120px] resize-y text-[14px]"
            maxLength={4000}
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            placeholder="Anything the model should know: preferences, project brief, notes…"
            required
          />
          <div className="mt-1 text-right text-[11px] text-white/30">{draft.content.length}/4000</div>
        </div>

        {error && <p className="note-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !draft.label.trim() || !draft.content.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {initial ? "Save changes" : "Add card"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
