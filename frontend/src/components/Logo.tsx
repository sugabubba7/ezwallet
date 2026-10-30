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
  const ring = tone === "light" ? "ring-white" : "ring-ink-950";
  return (
    <div className={`flex items-center gap-2.5 ${color} ${className}`}>
      {!wordmarkOnly && (
        <span className={`grid h-9 w-9 place-items-center rounded-full ring-[3px] ${ring}`}>
          <span
            aria-hidden
            className="h-[22px] w-[22px] bg-current"
            style={{
              WebkitMask: "url(/wallet-mark-bold.png) center / contain no-repeat",
              mask: "url(/wallet-mark-bold.png) center / contain no-repeat",
            }}
          />
        </span>
      )}
      <span className={`font-extrabold italic leading-none tracking-[-0.04em] ${large ? "text-[34px]" : "text-[21px]"}`}>ezwallet</span>
    </div>
  );
}
