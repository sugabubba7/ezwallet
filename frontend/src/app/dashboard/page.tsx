"use client";

import { KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardEditorModal, type CardDraft } from "@/components/CardEditorModal";
import { CoverFlowSlider } from "@/components/CoverFlowSlider";
import { LlmConsole } from "@/components/LlmConsole";
import { Modal } from "@/components/Modal";
import { PinModal } from "@/components/PinModal";
import { TopBar } from "@/components/TopBar";
import { WalletContainer } from "@/components/WalletContainer";
import { ApiError, api, errMsg } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { CardMeta, CardRevealed, Chat, LlmStatus } from "@/lib/types";

export default function Dashboard() {
  const { user, loading } = useRequireAuth();

  const [cards, setCards] = useState<CardMeta[]>([]);
  const [revealed, setRevealed] = useState<CardRevealed[] | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [focusChat, setFocusChat] = useState<number | null>(null);
  const [llm, setLlm] = useState<LlmStatus | null>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; card: CardRevealed | null }>({ open: false, card: null });
  const [confirmDelete, setConfirmDelete] = useState<CardRevealed | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const lockLocal = useCallback(() => {
    setRevealed(null); // drops decrypted content from memory
    setExpiresAt(null);
    setSelectedId(null);
  }, []);

  const loadCards = useCallback(async () => {
    const res = await api<{ cards: CardMeta[]; locked: boolean }>("/wallet/cards");
    setCards(res.cards);
  }, []);

  const loadChats = useCallback(async () => {
    const res = await api<{ chats: Chat[] }>("/chats");
    setChats(res.chats);
  }, []);

  useEffect(() => {
    if (!user) return;
    // The vault always starts locked on a fresh page load.
    api("/wallet/lock", { method: "POST" }).catch(() => {});
    loadCards().catch(() => {});
    loadChats().catch(() => {});
    api<LlmStatus>("/llm/status").then(setLlm).catch(() => {});
  }, [user, loadCards, loadChats]);

  // Auto-lock when the server-side vault session expires.
  useEffect(() => {
    if (!expiresAt) return;
    const t = setTimeout(() => {
      lockLocal();
      flash("Vault auto-locked");
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [expiresAt, lockLocal, flash]);

  const unlock = async (pin: string) => {
    const res = await api<{ cards: CardRevealed[]; expires_in_seconds: number }>("/wallet/unlock", { method: "POST", body: { pin } });
    setRevealed(res.cards);
    setCards(res.cards);
    setExpiresAt(Date.now() + res.expires_in_seconds * 1000);
    setPinOpen(false);
  };

  const lock = async () => {
    lockLocal();
    await api("/wallet/lock", { method: "POST" }).catch(() => {});
  };

  const handleVaultError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      lockLocal();
      setPinOpen(true);
    }
    throw new Error(errMsg(e));
  };

  const saveCard = async (draft: CardDraft) => {
    try {
      const card = editor.card
        ? await api<CardRevealed>(`/wallet/cards/${editor.card.id}`, { method: "PUT", body: draft })
        : await api<CardRevealed>("/wallet/cards", { method: "POST", body: draft });
      setRevealed((r) => (r ? (editor.card ? r.map((c) => (c.id === card.id ? card : c)) : [...r, card]) : r));
      setCards((cs) => (editor.card ? cs.map((c) => (c.id === card.id ? card : c)) : [...cs, card]));
      setEditor({ open: false, card: null });
      flash(editor.card ? "Card updated" : "Card added to wallet");
    } catch (e) {
      handleVaultError(e);
    }
  };

  const deleteCard = async (card: CardRevealed) => {
    try {
      await api(`/wallet/cards/${card.id}`, { method: "DELETE" });
      setRevealed((r) => r?.filter((c) => c.id !== card.id) ?? null);
      setCards((cs) => cs.filter((c) => c.id !== card.id));
      if (selectedId === card.id) setSelectedId(null);
      flash("Card deleted");
    } catch (e) {
      flash(errMsg(e));
      if (e instanceof ApiError && e.status === 401) lockLocal();
    } finally {
      setConfirmDelete(null);
    }
  };

  const deleteChat = async (chat: Chat) => {
    try {
      await api(`/chats/${chat.id}`, { method: "DELETE" });
      setChats((cs) => cs.filter((c) => c.id !== chat.id));
      flash("Summary deleted");
    } catch (e) {
      flash(errMsg(e));
    }
  };

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <TopBar llm={llm} />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Signed in as</p>
            <h1 className="mt-1 break-all text-2xl font-semibold text-white sm:text-3xl">{user.email}</h1>
          </div>
          <p className="max-w-md text-sm text-white/70">
            Keep sensitive context sealed in your wallet. Attach a card only when a prompt needs it; Gemini sees it once and nothing is retained.
          </p>
        </div>

        {!user.has_pin && (
          <div className="liquid-glass mb-6 flex flex-wrap items-center gap-3 rounded-3xl px-5 py-4 text-sm">
            <KeyRound className="h-5 w-5 text-white" />
            <span className="flex-1 text-white">Set a 4-digit vault PIN to unlock your context cards.</span>
            <Link href="/account#pin" className="btn-primary !py-2">Set PIN</Link>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          {/* Section B: wallet */}
          <section className="liquid-glass rounded-[36px] px-4 pb-8 pt-5 sm:px-8" aria-label="Encrypted data pocket">
            <div className="mb-2 flex items-center justify-between text-white">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Data Pocket</h2>
              <span className="chip bg-black/20 text-white/80">{cards.length} cards · encrypted</span>
            </div>
            <WalletContainer
              cards={cards}
              revealed={revealed}
              expiresAt={expiresAt}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUnlockRequest={() => (user.has_pin ? setPinOpen(true) : flash("Set a vault PIN in Account first"))}
              onLock={lock}
              onAdd={() => setEditor({ open: true, card: null })}
              onEdit={(card) => setEditor({ open: true, card })}
              onDelete={(card) => setConfirmDelete(card)}
            />
          </section>

          {/* Section A: cover flow */}
          <section className="liquid-glass min-h-[560px] overflow-hidden rounded-[36px]" aria-label="Chat summaries">
            <CoverFlowSlider chats={chats} activeId={focusChat} onDelete={deleteChat} />
          </section>
        </div>

        <div className="mt-6">
          <LlmConsole
            llm={llm}
            cards={revealed}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUnlockRequest={() => (user.has_pin ? setPinOpen(true) : flash("Set a vault PIN in Account first"))}
            onVaultLocked={() => {
              lockLocal();
              setPinOpen(true);
            }}
            onChatUpdated={(chat) => {
              // a new or continued session moves to the front of the archive
              setChats((cs) => [chat, ...cs.filter((c) => c.id !== chat.id)]);
              setFocusChat(chat.id);
            }}
          />
        </div>
      </main>

      <PinModal open={pinOpen} onClose={() => setPinOpen(false)} onSubmit={async (pin) => {
        try {
          await unlock(pin);
        } catch (e) {
          throw new Error(errMsg(e));
        }
      }} />
      <CardEditorModal open={editor.open} initial={editor.card} onClose={() => setEditor({ open: false, card: null })} onSave={saveCard} />
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete context card?" width="max-w-sm">
        <p className="text-sm text-white/60">
          <strong className="text-white">{confirmDelete?.label}</strong> will be permanently removed from your wallet.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn-danger" onClick={() => confirmDelete && deleteCard(confirmDelete)}>
            Delete
          </button>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-950 shadow-2xl" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
