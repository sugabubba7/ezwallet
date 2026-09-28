"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  masked?: boolean;
  error?: boolean;
  size?: "md" | "lg";
  id?: string;
};

/** Four single-digit boxes with auto-advance, backspace and paste support. */
export function PinInput({ value, onChange, onComplete, autoFocus, disabled, masked = true, error, size = "md", id }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, 3)]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const setDigits = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, 4);
    onChange(clean);
    refs.current[Math.min(clean.length, 3)]?.focus();
    if (clean.length === 4) onComplete?.(clean);
  };

  const box = size === "lg" ? "h-16 w-14 text-2xl" : "h-12 w-11 text-xl";

  return (
    <div className={`flex gap-3 ${error ? "animate-shake" : ""}`} role="group" aria-label="4-digit PIN">
      {[0, 1, 2, 3].map((i) => {
        const ch = value[i] ?? "";
        return (
          <input
            key={i}
            id={i === 0 ? id : undefined}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type={masked ? "password" : "text"}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            disabled={disabled}
            aria-label={`PIN digit ${i + 1}`}
            value={ch}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(-1);
              if (!d) return;
              const arr = value.split("");
              arr[i] = d;
              setDigits(arr.join("").slice(0, i + 1) + value.slice(i + 1));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                if (value[i]) setDigits(value.slice(0, i) + value.slice(i + 1));
                else if (i > 0) {
                  setDigits(value.slice(0, i - 1) + value.slice(i));
                  refs.current[i - 1]?.focus();
                }
              } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
              else if (e.key === "ArrowRight" && i < 3) refs.current[i + 1]?.focus();
            }}
            onPaste={(e) => {
              e.preventDefault();
              setDigits(e.clipboardData.getData("text"));
            }}
            className={`${box} rounded-xl border bg-white/[0.04] text-center font-semibold text-white outline-none transition
              ${error ? "border-red-500/70" : ch ? "border-ember-500/60" : "border-white/10"}
              focus:border-ember-500 focus:ring-4 focus:ring-ember-500/20 disabled:opacity-50`}
          />
        );
      })}
    </div>
  );
}
