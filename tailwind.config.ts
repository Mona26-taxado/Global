import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./wallet/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#04060f",
        navy: "#0a1024",
        panel: "rgba(12, 18, 40, 0.72)",
        violet: "#7c5cff",
        electric: "#3b82f6",
        mute: "#9aa8c7",
        danger: "#fb7185",
        mint: "#5ee9b5",
      },
      boxShadow: {
        glow: "0 0 80px rgba(124, 92, 255, 0.18)",
        card: "0 24px 60px rgba(0, 0, 0, 0.4)",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "var(--font-outfit)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
