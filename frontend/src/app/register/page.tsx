"use client";

import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForms";
import { useRedirectIfAuthed } from "@/lib/auth";

export default function RegisterPage() {
  useRedirectIfAuthed();
  return (
    <AuthShell title="Create your LLM wallet" subtitle="Encrypted · zero retention">
      <RegisterForm />
    </AuthShell>
  );
}
