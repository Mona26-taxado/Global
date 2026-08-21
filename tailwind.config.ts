import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./wallet/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050811",
        surface: "#070b16",
        surface2: "#0d1322",
        elevated: "#101827",
        navy: "#0a1024",
        panel: "#0d1322",
        violet: "#7c5cff",
        electric: "#3b82f6",
        mute: "#94a3b8",
        secondary: "#c3cce0",
        cream: "#f7f9fc",
        danger: "#FB7185",
        mint: "#5ee9b5",
        warning: "#f59e0b",
        info: "#3b82f6",
        line: "rgba(148,163,184,0.14)",
      },
      boxShadow: {
        glow: "0 0 32px rgba(124, 92, 255, 0.16)",
        card: "0 8px 30px rgba(0, 0, 0, 0.18)",
        lift: "0 18px 50px rgba(0, 0, 0, 0.30)",
      },
      maxWidth: {
        content: "1280px",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "var(--font-outfit)", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        feature: "20px",
        modal: "24px",
      },
    },
  },
  plugins: [],
};

export default config;
