/** Light gray field with soft, blurred light and shade, matching the landing page. */
export function PageBackdrop() {
  return (
    <div className="page-bg" aria-hidden>
      <span style={{ left: "-10%", top: "10%", width: "38vw", height: "60vh", background: "rgba(150,150,160,.28)" }} />
      <span style={{ right: "-8%", top: "-15%", width: "50vw", height: "50vh", background: "rgba(255,255,255,.7)" }} />
      <span style={{ right: "5%", bottom: "-25%", width: "55vw", height: "55vh", background: "rgba(120,120,132,.3)" }} />
      <span style={{ left: "30%", bottom: "-30%", width: "40vw", height: "40vh", background: "rgba(255,255,255,.55)" }} />
    </div>
  );
}
