"use client";

import { Cpu, LayoutGrid, LogOut, UserCog } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { LlmStatus } from "@/lib/types";
import { GoogleG } from "./GoogleButton";
import { Logo } from "./Logo";

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
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0f0d0c]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="ml-2 flex gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                path === n.href ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
              }`}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs sm:flex ${
              user.google_linked ? "bg-white/10 text-white/85" : "bg-white/[0.04] text-white/40"
            }`}
            title={user.google_linked ? "Google identity linked" : "No Google identity linked"}
          >
            <GoogleG className={`h-3.5 w-3.5 ${user.google_linked ? "" : "opacity-40 grayscale"}`} />
            {user.google_linked ? "Google linked" : "Google not linked"}
          </span>
          {llm && (
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs md:flex ${
                llm.configured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
              }`}
              title={llm.configured ? `Proxying to ${llm.endpoint}` : "Set GEMINI_API_KEY in backend/.env"}
            >
              <Cpu className="h-3.5 w-3.5" />
              {llm.configured ? `Gemini · ${llm.model}` : "Gemini not configured"}
            </span>
          )}
          <div className="flex items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-1 pr-3">
            {user.google_picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.google_picture} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ember-500 text-[11px] font-bold uppercase">
                {user.email[0]}
              </span>
            )}
            <span className="max-w-[180px] truncate text-sm text-white/85" data-testid="user-email">
              {user.email}
            </span>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
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
