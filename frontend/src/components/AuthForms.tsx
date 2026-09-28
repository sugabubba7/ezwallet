"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";
import { GoogleButton } from "./GoogleButton";
import { PinInput } from "./PinInput";

type AuthRes = { user: User; access_token: string };

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-white/30">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function PasswordField({
  value,
  onChange,
  id,
  autoComplete,
  placeholder = "••••••••",
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
  autoComplete: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="input pr-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 hover:text-white"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function useGoogle() {
  const { setUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const onCredential = async (credential: string) => {
    setError(null);
    try {
      const res = await api<AuthRes>("/auth/google", { method: "POST", body: { credential } });
      setUser(res.user);
      router.replace("/dashboard");
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return { error, onCredential };
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-white/55">
    {children}
  </label>
);

export function LoginForm() {
  const { setUser } = useAuth();
  const router = useRouter();
  const google = useGoogle();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthRes>("/auth/login", { method: "POST", body: { email, password } });
      setUser(res.user);
      router.replace("/dashboard");
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <>
      <GoogleButton mode="signin" onCredential={google.onCredential} />
      {google.error && <p className="note-error mt-3 text-center">{google.error}</p>}
      <Divider />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error && <p className="note-error" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !email || !password}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-white/50">
        New here?{" "}
        <Link href="/register" className="font-medium text-ember-300 hover:text-ember-200">
          Create a wallet
        </Link>
      </p>
    </>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return s;
}

export function RegisterForm() {
  const { setUser } = useAuth();
  const router = useRouter();
  const google = useGoogle();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = strength(password);
  const valid = email.includes("@") && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && pin.length === 4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthRes>("/auth/register", { method: "POST", body: { email, password, pin } });
      setUser(res.user);
      router.replace("/dashboard");
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <>
      <GoogleButton mode="signup" onCredential={google.onCredential} />
      {google.error && <p className="note-error mt-3 text-center">{google.error}</p>}
      <Divider />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8+ characters, letters and numbers" />
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition ${
                  password && i < s ? ["bg-ember-700", "bg-ember-400", "bg-ember-200"][s - 1] : "bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="pin">Vault PIN</Label>
          <div className="flex items-center justify-between gap-3">
            <PinInput id="pin" value={pin} onChange={setPin} />
            <p className="text-right text-[11px] leading-snug text-white/40">
              4 digits.
              <br />
              Unlocks your context cards.
            </p>
          </div>
        </div>
        {error && <p className="note-error" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !valid}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create wallet
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-white/50">
        Already have a wallet?{" "}
        <Link href="/login" className="font-medium text-ember-300 hover:text-ember-200">
          Log in
        </Link>
      </p>
    </>
  );
}
