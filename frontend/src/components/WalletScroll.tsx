import type { CSSProperties } from "react";

function CardFace({
  cls,
  top,
  z,
  title,
  line,
  bg,
  sub,
}: {
  cls: string;
  top: number;
  z: number;
  title: string;
  line: string;
  bg: string;
  sub: string;
}) {
  const style: CSSProperties = {
    position: "absolute",
    left: 20,
    top,
    width: 300,
    height: 160,
    zIndex: z,
    boxSizing: "border-box",
    background: bg,
    borderRadius: 14,
    padding: "10px 16px",
    boxShadow: "0 -4px 14px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -3px 6px rgba(0,0,0,0.06)",
    color: "#0B0B0C",
  };
  return (
    <div className={cls} style={style}>
      <div className="text-[20px] font-extrabold leading-[1.3] tracking-tight">{title}</div>
      <div className="mt-1.5 text-[14px] leading-[1.45]" style={{ color: sub }}>
        {line}
      </div>
    </div>
  );
}

/**
 * A wallet that opens as you scroll: closed with a "scroll to open" prompt, the
 * cover swings open sideways, the view zooms in on the card section, and the
 * three steps pop out one at a time. All motion is CSS (see globals.css).
 */
export function WalletScroll() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="ezw-pocket" style={{ height: 2600 }}>
        <div
          className="ezw-stage"
          style={{
            position: "sticky",
            top: 60,
            height: 560,
            overflow: "hidden",
            boxSizing: "border-box",
            border: "1px solid #CBCBD1",
            borderRadius: 32,
            background: "linear-gradient(145deg,#EFEFF1,#E3E3E7)",
          }}
        >
          <div className="ezw-rig" style={{ position: "absolute", inset: 0 }}>
            <div className="ezw-wallet" style={{ position: "absolute", left: 186, top: 140, width: 340, height: 320 }}>
              {/* inside of the wallet: card section */}
              <div aria-hidden className="ezw-leather ezw-leather-deep" style={{ position: "absolute", inset: 0, borderRadius: 18 }} />
              <CardFace cls="ezw-c3" top={50} z={1} title="3 · Continue" line="Open any other AI and pick up where you left off." bg="linear-gradient(145deg,#A9A9B1,#8E8E96)" sub="#0B0B0C" />
              <CardFace cls="ezw-c2" top={100} z={2} title="2 · Carry" line="The topic and key points wait for five minutes." bg="linear-gradient(145deg,#CFCFD5,#B8B8BF)" sub="#26262A" />
              <CardFace cls="ezw-c1" top={150} z={3} title="1 · Read" line="Your latest chat is summarized as you go, in your browser." bg="linear-gradient(145deg,#F2F2F4,#E0E0E4)" sub="#26262A" />

              {/* front card pocket */}
              <div
                aria-hidden
                className="ezw-leather"
                style={{ position: "absolute", left: 0, right: 0, top: 210, bottom: 0, zIndex: 5, borderRadius: "0 0 18px 18px" }}
              >
                <div style={{ position: "absolute", left: 14, right: 14, top: 12, bottom: 12, border: "1.5px dashed #4A4A51", borderRadius: 12 }} />
              </div>

              {/* cover: closed at first, swings open sideways like a book */}
              <div className="ezw-cover" aria-hidden style={{ position: "absolute", left: 0, top: 0, width: 340, height: 320, zIndex: 8 }}>
                <div className="ezw-face ezw-leather">
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, borderRadius: "18px 0 0 18px", background: "linear-gradient(90deg,rgba(255,255,255,0.28),transparent)" }} />
                  <div style={{ position: "absolute", left: 16, right: 16, top: 16, bottom: 16, border: "1.5px dashed #5A5A62", borderRadius: 12 }} />
                  <div className="ezw-snap" style={{ position: "absolute", right: 30, top: "50%", marginTop: -18, width: 36, height: 36 }} />
                </div>
                <div className="ezw-face ezw-leather ezw-leather-deep" style={{ transform: "rotateY(180deg)" }}>
                  <div style={{ position: "absolute", left: 16, right: 16, top: 16, bottom: 16, border: "1.5px dashed #4A4A51", borderRadius: 12 }} />
                  <div style={{ position: "absolute", left: 40, right: 40, top: 60, height: 96, border: "1.5px solid #4A4A51", borderRadius: 10 }} />
                </div>
              </div>
            </div>
          </div>

          {/* scroll prompt */}
          <div
            className="ezw-prompt"
            style={{ position: "absolute", left: 0, right: 0, bottom: 28, zIndex: 9, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "#26262A", fontSize: 15, fontWeight: 600 }}
          >
            Scroll to open
            <svg className="ezw-chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#26262A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
