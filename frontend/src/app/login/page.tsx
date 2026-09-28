"use client";

import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";
import { useRedirectIfAuthed } from "@/lib/auth";

export default function LoginPage() {
  useRedirectIfAuthed();
  return (
    <AuthShell title="Welcome back" subtitle="Sensitive context vault">
      <LoginForm />
    </AuthShell>
  );
}
