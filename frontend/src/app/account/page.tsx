"use client";

import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Lock, Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { PasswordField } from "@/components/AuthForms";
import { GoogleG } from "@/components/GoogleButton";
import { Modal } from "@/components/Modal";
import { PinInput } from "@/components/PinInput";
import { TopBar } from "@/components/TopBar";
import { api, errMsg } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

type Status = { kind: "ok" | "err"; msg: string } | null;

function useAction() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ kind: "ok", msg: await fn() });
      return true;
    } catch (e) {
      setStatus({ kind: "err", msg: errMsg(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, status, run };
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={`flex items-center gap-2 text-sm ${status.kind === "ok" ? "text-emerald-300" : "text-red-300"}`} role={status.kind === "err" ? "alert" : "status"}>
      {status.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {status.msg}
    </p>
  );
}

function Panel({ id, icon: Icon, title, desc, children }: { id?: string; icon: typeof Mail; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section id={id} className="glass-dark scroll-mt-24 rounded-[24px] p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
          <Icon className="h-[18px] w-[18px] text-ember-400" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-white/45">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-white/55">
    {children}
  </label>
);

export default function AccountPage() {
  const { user, loading, setUser } = useRequireAuth();

  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const email = useAction();

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const password = useAction();

  const [pin, setPin] = useState("");
  const [pinPw, setPinPw] = useState("");
  const pinAct = useAction();

  const [delOpen, setDelOpen] = useState(false);
  const [delEmail, setDelEmail] = useState("");
  const [delPw, setDelPw] = useState("");
  const del = useAction();

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </main>
    );
  }
  const needsPw = user.has_password;

  return (
    <div className="min-h-screen bg-[radial-gradient(80%_60%_at_100%_0%,rgba(232,112,42,.12),transparent)]">
      <TopBar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-16 pt-8 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">Account management</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Your wallet identity</h1>
        </div>

        {/* Identity summary */}
        <section className="bg-sunrise rounded-[24px] p-[1px]">
          <div className="leather flex flex-wrap items-center gap-4 rounded-[23px] p-5">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ember-500 text-lg font-bold uppercase">{user.email[0]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{user.email}</div>
              <div className="text-xs text-white/45">Member since {new Date(user.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge on={user.google_linked}><GoogleG className="h-3.5 w-3.5" /> {user.google_linked ? "Google linked" : "Google not linked"}</Badge>
              <Badge on={user.has_password}><Lock className="h-3.5 w-3.5" /> {user.has_password ? "Password set" : "No password"}</Badge>
              <Badge on={user.has_pin}><KeyRound className="h-3.5 w-3.5" /> {user.has_pin ? "Vault PIN set" : "No PIN"}</Badge>
            </div>
          </div>
        </section>

        {/* Email */}
        <Panel icon={Mail} title="Change email" desc="PUT /api/v1/account/email">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await email.run(async () => {
                const u = await api<User>("/account/email", { method: "PUT", body: { new_email: newEmail, current_password: needsPw ? emailPw : null } });
                setUser(u);
                return `Email changed to ${u.email}`;
              });
              if (ok) {
                setNewEmail("");
                setEmailPw("");
              }
            }}
          >
            <div className={needsPw ? "" : "sm:col-span-2"}>
              <Label htmlFor="new-email">New email</Label>
              <input id="new-email" type="email" className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={user.email} required />
            </div>
            {needsPw && (
              <div>
                <Label htmlFor="email-pw">Current password</Label>
                <PasswordField id="email-pw" value={emailPw} onChange={setEmailPw} autoComplete="current-password" />
              </div>
            )}
            <div className="flex items-center gap-4 sm:col-span-2">
              <button className="btn-primary" disabled={email.busy || !newEmail || (needsPw && !emailPw)}>
                {email.busy && <Loader2 className="h-4 w-4 animate-spin" />} Update email
              </button>
              <StatusLine status={email.status} />
            </div>
          </form>
        </Panel>

        {/* Password */}
        <Panel icon={Lock} title={needsPw ? "Update password" : "Set a password"} desc={needsPw ? "PUT /api/v1/account/password · signs out other sessions" : "Add email + password login alongside Google"}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await password.run(async () => {
                if (newPw !== confirmPw) throw new Error("New passwords do not match");
                const res = await api<{ message: string }>("/account/password", { method: "PUT", body: { current_password: needsPw ? curPw : null, new_password: newPw } });
                setUser({ ...user, has_password: true });
                return res.message;
              });
              if (ok) {
                setCurPw("");
                setNewPw("");
                setConfirmPw("");
              }
            }}
          >
            {needsPw && (
              <div className="sm:col-span-2">
                <Label htmlFor="cur-pw">Current password</Label>
                <PasswordField id="cur-pw" value={curPw} onChange={setCurPw} autoComplete="current-password" />
              </div>
            )}
            <div>
              <Label htmlFor="new-pw">New password</Label>
              <PasswordField id="new-pw" value={newPw} onChange={setNewPw} autoComplete="new-password" placeholder="8+ chars, letters & numbers" />
            </div>
            <div>
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <PasswordField id="confirm-pw" value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
            </div>
            <div className="flex items-center gap-4 sm:col-span-2">
              <button className="btn-primary" disabled={password.busy || !newPw || !confirmPw || (needsPw && !curPw)}>
                {password.busy && <Loader2 className="h-4 w-4 animate-spin" />} {needsPw ? "Update password" : "Set password"}
              </button>
              <StatusLine status={password.status} />
            </div>
          </form>
        </Panel>

        {/* PIN */}
        <Panel id="pin" icon={KeyRound} title={user.has_pin ? "Change vault PIN" : "Set vault PIN"} desc="PUT /api/v1/account/pin · the 4 digits that unlock your data pocket">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await pinAct.run(async () => {
                const res = await api<{ message: string }>("/account/pin", { method: "PUT", body: { new_pin: pin, current_password: needsPw ? pinPw : null } });
                setUser({ ...user, has_pin: true });
                return res.message;
              });
              if (ok) {
                setPin("");
                setPinPw("");
              }
            }}
          >
            <div>
              <Label htmlFor="new-pin">New PIN</Label>
              <PinInput id="new-pin" value={pin} onChange={setPin} />
            </div>
            {needsPw && (
              <div>
                <Label htmlFor="pin-pw">Current password</Label>
                <PasswordField id="pin-pw" value={pinPw} onChange={setPinPw} autoComplete="current-password" />
              </div>
            )}
            <div className="flex items-center gap-4 sm:col-span-2">
              <button className="btn-primary" disabled={pinAct.busy || pin.length !== 4 || (needsPw && !pinPw)}>
                {pinAct.busy && <Loader2 className="h-4 w-4 animate-spin" />} {user.has_pin ? "Change PIN" : "Set PIN"}
              </button>
              <StatusLine status={pinAct.status} />
            </div>
          </form>
        </Panel>

        {/* Danger zone */}
        <section className="rounded-[24px] border border-red-500/25 bg-red-500/[0.05] p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/15">
              <Trash2 className="h-[18px] w-[18px] text-red-400" />
            </span>
            <div className="flex-1">
              <h2 className="font-semibold text-red-200">Delete account</h2>
              <p className="text-sm text-white/45">DELETE /api/v1/account · permanently erases your account, wallet cards and chat summaries.</p>
            </div>
            <button className="btn-ghost !border-red-500/40 !text-red-300 hover:!bg-red-500/15" onClick={() => setDelOpen(true)}>
              Delete permanently
            </button>
          </div>
        </section>
      </main>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete your wallet forever?">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await del.run(async () => {
              const r = await api<{ message: string }>("/account", { method: "DELETE", body: { confirm_email: delEmail, current_password: needsPw ? delPw : null } });
              return r.message;
            });
            // Full reload: drops every bit of in-memory state for the deleted account.
            if (ok) window.location.replace("/register");
          }}
        >
          <p className="text-sm text-white/60">
            This cannot be undone. Type <strong className="text-white">{user.email}</strong> to confirm.
          </p>
          <input className="input" value={delEmail} onChange={(e) => setDelEmail(e.target.value)} placeholder={user.email} aria-label="Confirm email" />
          {needsPw && <PasswordField id="del-pw" value={delPw} onChange={setDelPw} autoComplete="current-password" placeholder="Current password" />}
          <StatusLine status={del.status} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setDelOpen(false)}>Cancel</button>
            <button className="btn-primary !bg-red-600 hover:!bg-red-500" disabled={del.busy || delEmail.toLowerCase() !== user.email || (needsPw && !delPw)}>
              {del.busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Badge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${on ? "bg-emerald-500/10 text-emerald-300" : "bg-white/[0.05] text-white/40"}`}>
      {children}
    </span>
  );
}
