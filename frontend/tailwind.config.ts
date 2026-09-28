import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ember: { 300: "#f7a26b", 400: "#f08a4b", 500: "#e8702a", 600: "#c95a1b" },
        leather: { 700: "#232323", 800: "#1a1a1a", 900: "#121212" },
        stitch: "#7a3f1d",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.18)",
        glow: "0 0 0 1px rgba(232,112,42,.55), 0 0 24px rgba(232,112,42,.35)",
      },
      keyframes: {
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "20%,60%": { transform: "translateX(-8px)" },
          "40%,80%": { transform: "translateX(8px)" },
        },
      },
      animation: { shake: "shake .4s ease-in-out" },
    },
  },
  plugins: [],
} satisfies Config;
