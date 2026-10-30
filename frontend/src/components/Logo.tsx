/**
 * Wordmark in Montserrat ExtraBold Italic, optionally with the wallet mark beside it.
 * White by default, black with tone="dark". `wordmarkOnly` drops the mark and
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
  return (
    <div className={`flex items-center gap-2.5 ${color} ${className}`}>
      {!wordmarkOnly && (
        <span
          aria-hidden
          className="h-[30px] w-[30px] bg-current"
          style={{
            WebkitMask: "url(/wallet-mark-bold.png) center / contain no-repeat",
            mask: "url(/wallet-mark-bold.png) center / contain no-repeat",
          }}
        />
      )}
      <span className={`font-extrabold italic leading-none tracking-[-0.04em] ${large ? "text-[34px]" : "text-[21px]"}`}>ezwallet</span>
    </div>
  );
}
