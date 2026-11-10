"use client";

import { useRef, useState, type RefObject } from "react";
import { motion, useAnimationFrame, useMotionValue, useScroll, useTransform } from "framer-motion";

/**
 * The two hands are one scanline image made from Michelangelo's "Creation of Adam"
 * (public domain, Sistine Chapel ceiling). It is 1900x400 and split at x = 908,
 * between the two index fingertips, so the left piece is 908 wide and the right
 * piece is 992 wide. Both pieces share one height, which keeps the fingertips level.
 */
const HAND_IMG = "/hands/creation.png";
const LEFT_RATIO = 908 / 400;
const RIGHT_RATIO = 992 / 400;

const LAYERS = 16;
const LAYER_GAP = 1.5;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

/**
 * The Relay mark as a thick 3D slab: sixteen copies of the mark stacked along Z,
 * so it has real edges when it turns. Each axis keeps its own angular velocity,
 * which eases toward a new random target every so often, so the tumble never
 * repeats and can change direction at any moment. Pointing at it makes the
 * targets many times faster.
 */
function Wallet3D({ href, fast, onHover }: { href: string; fast: boolean; onHover: (v: boolean) => void }) {
  const rx = useMotionValue(rand(0, 360));
  const ry = useMotionValue(rand(0, 360));
  const rz = useMotionValue(rand(-20, 20));
  const vel = useRef([0, 0, 0]);
  const target = useRef([rand(-120, 120), rand(-200, 200), rand(-40, 40)]);
  const nextPick = useRef(0);

  useAnimationFrame((t, delta) => {
    if (t >= nextPick.current) {
      const burst = fast ? 1 : 0;
      target.current = [
        sign() * (burst ? rand(500, 1500) : rand(30, 180)),
        sign() * (burst ? rand(700, 1800) : rand(60, 260)),
        sign() * (burst ? rand(200, 900) : rand(0, 70)),
      ];
      nextPick.current = t + (burst ? rand(120, 380) : rand(500, 1500));
    }
    const k = Math.min(1, delta / (fast ? 90 : 350));
    const v = vel.current;
    for (let i = 0; i < 3; i++) v[i] += (target.current[i] - v[i]) * k;
    const dt = delta / 1000;
    rx.set(rx.get() + v[0] * dt);
    ry.set(ry.get() + v[1] * dt);
    rz.set(rz.get() + v[2] * dt);
  });

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Try the Relay extension now"
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className="relative block h-[96px] w-[96px] cursor-pointer sm:h-[124px] sm:w-[124px]"
      style={{ perspective: 700 }}
    >
      <span aria-hidden className={`absolute inset-[-45%] rounded-full bg-white/20 blur-3xl transition-opacity duration-300 ${fast ? "opacity-100" : "opacity-35"}`} />
      <motion.span aria-hidden className="absolute inset-0 block" style={{ rotateX: rx, rotateY: ry, rotateZ: rz, transformStyle: "preserve-3d" }}>
        {Array.from({ length: LAYERS }, (_, i) => {
          const edge = i === 0 || i === LAYERS - 1;
          const shade = edge ? 255 : 120 + Math.round(Math.abs(i - (LAYERS - 1) / 2) * 10);
          return (
            <span
              key={i}
              className="absolute inset-0 block"
              style={{
                transform: `translateZ(${(i - (LAYERS - 1) / 2) * LAYER_GAP}px)`,
                background: `rgb(${shade},${shade},${shade + 4})`,
                WebkitMask: "url(/wallet-mark-bold.png) center / contain no-repeat",
                mask: "url(/wallet-mark-bold.png) center / contain no-repeat",
              }}
            />
          );
        })}
      </motion.span>
    </a>
  );
}

/**
 * Closing scene. As you scroll, the two hands slide in from the sides until the
 * index fingers almost touch. A 3D Relay wallet tumbles between them at random,
 * goes wild when you point at it, and opens the extension page when clicked.
 * Scroll position comes from `scrollRef`, the element that actually scrolls on the landing page.
 */
export function HandsFinale({ scrollRef, href }: { scrollRef: RefObject<HTMLElement | null>; href: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fast, setFast] = useState(false);
  const { scrollYProgress: p } = useScroll({ target: ref, container: scrollRef, offset: ["start start", "end end"] });

  const leftX = useTransform(p, [0.1, 0.65], ["-60vw", "0vw"]);
  const rightX = useTransform(p, [0.1, 0.65], ["60vw", "0vw"]);
  const handOpacity = useTransform(p, [0.1, 0.3], [0, 1]);
  const markOpacity = useTransform(p, [0.6, 0.78], [0, 1]);
  const markScale = useTransform(p, [0.6, 0.78], [0.5, 1]);
  const textOpacity = useTransform(p, [0.72, 0.88], [0, 1]);

  const hand = (ratio: number, pos: "left" | "right") => ({
    height: "var(--h)",
    width: `calc(var(--h) * ${ratio})`,
    backgroundImage: `url(${HAND_IMG})`,
    backgroundSize: "auto 100%",
    backgroundPosition: pos,
    backgroundRepeat: "no-repeat",
    mixBlendMode: "screen" as const,
  });

  return (
    <div ref={ref} className="relative h-[280vh]" style={{ background: "linear-gradient(180deg, #E6E6E9 0, #0B0B0C 70vh, #0B0B0C 100%)" }}>
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden" style={{ ["--h" as string]: "clamp(110px, 19vw, 380px)" }}>
        <div className="flex items-center justify-center">
          <motion.div aria-hidden style={{ ...hand(LEFT_RATIO, "left"), x: leftX, opacity: handOpacity }} className="flex-none" />

          <div className="relative flex w-[120px] flex-none items-center justify-center sm:w-[170px]" style={{ transform: "translateY(calc(var(--h) * -0.05))" }}>
            <motion.div style={{ opacity: markOpacity, scale: markScale }}>
              <Wallet3D href={href} fast={fast} onHover={setFast} />
            </motion.div>
            <motion.p
              style={{ opacity: textOpacity }}
              className="pointer-events-none absolute left-1/2 top-[calc(50%+95px)] m-0 w-[260px] -translate-x-1/2 text-center text-[17px] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[20px]"
            >
              Try the Relay <span className="italic">extension</span> now!
            </motion.p>
          </div>

          <motion.div aria-hidden style={{ ...hand(RIGHT_RATIO, "right"), x: rightX, opacity: handOpacity }} className="flex-none" />
        </div>
      </div>
    </div>
  );
}
