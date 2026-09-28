"use client";

import { useEffect, useRef, useState } from "react";

type GoogleId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Google sign-in"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type Props = {
  mode: "signin" | "signup";
  onCredential: (credential: string) => void;
};

/** Google Identity Services button. The ID token is verified by the backend. */
export function GoogleButton({ mode, onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => cb.current(r.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: mode === "signup" ? "signup_with" : "signin_with",
          width: Math.min(ref.current.offsetWidth || 320, 400),
          logo_alignment: "center",
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!CLIENT_ID || failed) {
    return (
      <button
        type="button"
        disabled
        title={failed ? "Could not load Google sign-in" : "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable"}
        className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.03] text-sm text-white/40"
      >
        <GoogleG className="h-4 w-4 opacity-50" />
        {mode === "signup" ? "Sign up with Google" : "Log in with Google"}
        <span className="text-[11px]">(not configured)</span>
      </button>
    );
  }
  return <div ref={ref} className="flex h-11 w-full justify-center [color-scheme:light]" />;
}

export function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
