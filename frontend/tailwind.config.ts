import type { Config } from "tailwindcss";

/** One typeface (Inter) and one palette: orange shades + warm blacks. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ember: {
          50: "#fff4eb",
          100: "#ffe4cc",
          200: "#ffc895",
          300: "#ffa65c",
          400: "#fb8a35",
          500: "#e8702a",
          600: "#c9551a",
          700: "#9e3e12",
          800: "#7a2e0e",
          900: "#4d1c08",
          950: "#2a0f04",
        },
        ink: { 700: "#2a211b", 800: "#1d1612", 900: "#140f0c", 950: "#0b0806" },
        stitch: "#8a4a22",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(20,6,0,.55), 0 2px 6px rgba(20,6,0,.2)",
        glow: "0 0 0 1px rgba(232,112,42,.6), 0 0 24px rgba(232,112,42,.35)",
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
