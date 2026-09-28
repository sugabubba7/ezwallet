/** Orange field with soft, blurred dark shapes, the "motion-blurred figure" of the inspiration. */
export function PageBackdrop() {
  return (
    <div className="page-bg" aria-hidden>
      <span style={{ left: "-8%", top: "8%", width: "38vw", height: "70vh", background: "rgba(18,8,3,.78)" }} />
      <span style={{ left: "10%", top: "-12%", width: "18vw", height: "34vh", background: "rgba(24,10,4,.6)" }} />
      <span style={{ right: "-10%", top: "-15%", width: "50vw", height: "55vh", background: "rgba(255,178,92,.55)" }} />
      <span style={{ right: "5%", bottom: "-25%", width: "55vw", height: "60vh", background: "rgba(110,30,6,.75)" }} />
      <span style={{ left: "35%", bottom: "-30%", width: "40vw", height: "45vh", background: "rgba(12,6,2,.7)" }} />
    </div>
  );
}
