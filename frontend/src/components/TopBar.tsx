"use client";

import { Cpu, LayoutGrid, LogOut, UserCog } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { LlmStatus } from "@/lib/types";
import { GoogleG } from "./GoogleButton";
import { Logo } from "./Logo";

/** Floating liquid-glass header: no solid bar, the page shows through it. */
export function TopBar({ llm }: { llm?: LlmStatus | null }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  if (!user) return null;

  const nav = [
    { href: "/dashboard", label: "Wallet", icon: LayoutGrid },
    { href: "/account", label: "Account", icon: UserCog },
  ];

  return (
    <header className="sticky top-3 z-50 px-3 sm:top-4 sm:px-6">
      <div className="liquid-glass mx-auto flex max-w-7xl flex-wrap items-center gap-2 rounded-[28px] px-3 py-2 sm:gap-3 sm:rounded-full sm:px-4">
        <Logo className="pl-1" />
        <nav className="ml-1 flex gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                path === n.href ? "bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]" : "text-white/70 hover:text-white"
              }`}
            >
              <n.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`chip hidden sm:flex ${user.google_linked ? "bg-white/15 text-white" : "bg-black/15 text-white/55"}`}
            title={user.google_linked ? "Google identity linked" : "No Google identity linked"}
          >
            <GoogleG className={`h-3.5 w-3.5 ${user.google_linked ? "" : "opacity-50 grayscale"}`} />
            {user.google_linked ? "Google linked" : "Google not linked"}
          </span>
          {llm && (
            <span
              className={`chip hidden md:flex ${llm.configured ? "bg-white/15 text-white" : "bg-ink-950/40 text-ember-200"}`}
              title={llm.configured ? `Proxying to ${llm.endpoint}` : "Set GEMINI_API_KEY in backend/.env"}
            >
              <Cpu className="h-3.5 w-3.5" />
              {llm.configured ? `Gemini · ${llm.model}` : "Gemini not configured"}
            </span>
          )}
          <div className="flex items-center gap-2 rounded-full bg-black/20 py-1 pl-1 pr-3">
            {user.google_picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.google_picture} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-bold uppercase text-ink-950">
                {user.email[0]}
              </span>
            )}
            <span className="max-w-[120px] truncate text-sm text-white sm:max-w-[180px]" data-testid="user-email">
              {user.email}
            </span>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="rounded-full p-2 text-white/75 transition hover:bg-white/15 hover:text-white"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
