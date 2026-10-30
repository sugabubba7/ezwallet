/** Monochrome mark: white by default, black with tone="dark". */
export function Logo({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const color = tone === "light" ? "text-white" : "text-ink-950";
  const ring = tone === "light" ? "ring-white/70" : "ring-ink-950/70";
  return (
    <div className={`flex items-center gap-2 ${color} ${className}`}>
      <span className={`grid h-8 w-8 place-items-center rounded-full ring-[1.5px] ${ring}`}>
        <span
          aria-hidden
          className="h-5 w-5 bg-current"
          style={{
            WebkitMask: "url(/wallet-mark.png) center / contain no-repeat",
            mask: "url(/wallet-mark.png) center / contain no-repeat",
          }}
        />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">ezwallet</span>
    </div>
  );
}
