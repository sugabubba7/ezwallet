/**
 * Wordmark in Montserrat ExtraBold Italic, optionally with the wallet mark in a ring.
 * White by default, black with tone="dark". `wordmarkOnly` drops the ring and
 * `large` is for page headers.
 */
export function Logo({
  tone = "light",
  className = "",
  wordmarkOnly = false,
  large = false,
}: {
  tone?: "light" | "dark";
  className?: string;
  wordmarkOnly?: boolean;
  large?: boolean;
}) {
  const color = tone === "light" ? "text-white" : "text-ink-950";
  const ring = tone === "light" ? "ring-white/70" : "ring-ink-950/70";
  return (
    <div className={`flex items-center gap-2 ${color} ${className}`}>
      {!wordmarkOnly && (
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
      )}
      <span className={`font-extrabold italic leading-none tracking-[-0.04em] ${large ? "text-[34px]" : "text-[19px]"}`}>ezwallet</span>
    </div>
  );
}
