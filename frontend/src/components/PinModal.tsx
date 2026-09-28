"use client";

import { Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PinInput } from "./PinInput";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Resolve on success, throw an Error with a user-facing message on failure. */
  onSubmit: (pin: string) => Promise<void>;
};

export function PinModal({ open, onClose, onSubmit }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (open) {
      setPin("");
      setError(null);
    }
  }, [open]);

  const submit = async (value: string) => {
    if (value.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect PIN");
      setShakeKey((k) => k + 1);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-sm">
      <form
        className="flex flex-col items-center py-2 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          submit(pin);
        }}
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ember-500/10 shadow-glow">
          <Lock className="h-6 w-6 text-ember-400" />
        </span>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Sensitive context vault</p>
        <h2 className="mt-1 text-xl font-semibold">Enter PIN to unlock</h2>
        <div className="mt-6" key={shakeKey}>
          <PinInput value={pin} onChange={setPin} onComplete={submit} autoFocus disabled={busy} error={!!error} size="lg" />
        </div>
        <p className="mt-4 min-h-[20px] text-sm text-red-400" role="alert">
          {error}
        </p>
        <button className="btn-primary mt-2 w-full" disabled={busy || pin.length !== 4}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Unlock vault
        </button>
      </form>
    </Modal>
  );
}
