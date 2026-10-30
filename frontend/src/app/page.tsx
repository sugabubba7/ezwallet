"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { WalletScroll } from "@/components/WalletScroll";
import { useAuth } from "@/lib/auth";

const EXTENSION_URL = "https://github.com/sugabubba7/ezwallet/tree/main/extension";

const darkButton =
  "inline-flex items-center justify-center rounded-full bg-gradient-to-b from-[#2A2A2E] to-[#0B0B0C] font-semibold text-white";

function Step({ label, text, tone }: { label: string; text: string; tone: "ask" | "answer" }) {
  return (
    <div
      className={`box-border min-w-0 flex-1 basis-[280px] rounded-[20px] bg-gradient-to-br from-[#EFEFF1] to-[#E3E3E7] p-[22px] ${
        tone === "answer" ? "border border-[#0B0B0C]" : "border border-[#CBCBD1]"
      }`}
    >
      <div className="text-[13px] font-extrabold uppercase tracking-wider text-[#4A4A51]">{label}</div>
      <div className={`mt-2 text-base leading-normal ${tone === "ask" ? "italic" : "font-semibold"}`}>{text}</div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-[#E6E6E9] via-[#DCDCE0] to-[#E6E6E9] text-[#0B0B0C] [color-scheme:light]">
      {/* nav */}
      <header className="mx-auto flex max-w-[1000px] items-center justify-between gap-3 px-6 py-7">
        <Logo tone="dark" wordmarkOnly large />
        <div className="flex items-center gap-3 sm:gap-5">
          {user ? (
            <Link href="/dashboard" className={`${darkButton} min-h-[44px] px-4 text-sm sm:px-[22px] sm:text-[15px]`}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-[15px] font-medium text-[#4A4A51] hover:text-[#0B0B0C]">
                Sign in
              </Link>
              <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className={`${darkButton} min-h-[44px] px-4 text-sm sm:px-[22px] sm:text-[15px]`}>
                Add to Chrome
              </a>
            </>
          )}
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto flex max-w-[760px] flex-col items-center gap-7 px-6 pb-[72px] pt-[70px] text-center sm:pt-[110px]">
        <h1 className="m-0 text-[42px] font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-[64px]">
          Prompt once,
          <br />
          <span className="bg-gradient-to-r from-[#0B0B0C] to-[#8E8E96] bg-clip-text pr-1 font-extrabold italic text-transparent">pivot anywhere.</span>
        </h1>
        <p className="m-0 max-w-[560px] text-balance text-lg leading-normal text-[#4A4A51] sm:text-xl">Your context follows you from one AI to the <em className="font-bold text-[#0B0B0C]">next</em>.</p>
        <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className={`${darkButton} min-h-[52px] px-[30px] text-[17px]`}>
          Add to Chrome
        </a>
      </section>

      {/* one visual */}
      <section className="mx-auto flex max-w-[760px] flex-wrap items-center justify-center gap-5 px-6 pb-[110px]">
        <Step tone="ask" label="ChatGPT" text="I have pasta, garlic and tomatoes. What can I make?" />
        <div aria-hidden className="hidden h-0.5 w-10 flex-none sm:block bg-gradient-to-r from-[#B8B8BF] to-[#0B0B0C]" />
        <Step tone="answer" label="Gemini" text="Find olive oil and basil near me" />
      </section>

      {/* how it works: a wallet that opens as you scroll */}
      <section>
        <h2 className="mx-auto mb-14 max-w-[760px] px-6 text-center text-[34px] font-extrabold tracking-[-0.03em]">How it <em className="font-semibold">works</em></h2>
        <WalletScroll />
      </section>

      <p className="mx-auto max-w-[760px] px-6 pb-14 pt-6 text-center text-sm italic text-[#5E5E66]">Stays in your browser. <strong className="font-bold not-italic">Gone in five minutes.</strong></p>
    </div>
  );
}
