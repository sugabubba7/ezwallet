"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Archive, Lock, MessagesSquare, ShieldAlert } from "lucide-react";

const FEATURES = [
  { icon: MessagesSquare, title: "Every chat, one list", text: "See your chats from ChatGPT, Claude and Gemini as short summaries with the date and how many messages." },
  { icon: Lock, title: "A vault with a PIN", text: "Keep the context you choose in an encrypted vault. Share only the cards you pick with whichever AI you use." },
  { icon: ShieldAlert, title: "Warns before you send", text: "Spots personal data on your device before it reaches an AI, so you can stop and decide." },
  { icon: Archive, title: "Museum of Failures", text: "Save the problems you hit and exactly how you fixed them. Next time, it takes a minute." },
] as const;

function Tile({ icon: Icon, title, text, i }: (typeof FEATURES)[number] & { i: number }) {
  const [p, setP] = useState({ x: 50, y: 50 });
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: i * 0.08 }}
      whileHover={{ y: -4 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setP({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
      }}
      className="group relative min-w-0 flex-1 basis-[260px] overflow-hidden rounded-[24px] border border-[#CBCBD1] bg-gradient-to-br from-[#F3F3F5] to-[#E3E3E7] p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `radial-gradient(260px circle at ${p.x}% ${p.y}%, rgba(255,255,255,.9), transparent 70%)` }}
      />
      <div className="relative">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#2A2A2E] to-[#0B0B0C] text-white">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="mb-0 mt-5 text-xl font-extrabold tracking-[-0.02em]">{title}</h3>
        <p className="mb-0 mt-2 text-[15px] leading-normal text-[#4A4A51]">{text}</p>
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  return (
    <div className="mx-auto flex max-w-[1000px] flex-wrap gap-5 px-6">
      {FEATURES.map((f, i) => (
        <Tile key={f.title} {...f} i={i} />
      ))}
    </div>
  );
}
