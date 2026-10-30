import type { Config } from "tailwindcss";

/** One typeface (Montserrat) and one palette: grays, white and black. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ember: {
          50: "#f5f5f7",
          100: "#e8e8ec",
          200: "#d4d4d9",
          300: "#b8b8bf",
          400: "#9a9aa2",
          500: "#7c7c85",
          600: "#5e5e66",
          700: "#46464d",
          800: "#2e2e33",
          900: "#1c1c1f",
          950: "#0b0b0c",
        },
        ink: { 700: "#2a2a2e", 800: "#1c1c1f", 900: "#121214", 950: "#0b0b0c" },
        stitch: "#5a5a62",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(10,10,14,.55), 0 2px 6px rgba(10,10,14,.2)",
        glow: "0 0 0 1px rgba(255,255,255,.55), 0 0 24px rgba(255,255,255,.22)",
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
