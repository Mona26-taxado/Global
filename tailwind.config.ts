import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./wallet/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#04060F",
        surface: "#090D18",
        surface2: "#0D1322",
        elevated: "#11182A",
        navy: "#0a1024",
        panel: "#0D1322",
        violet: "#7C5CFF",
        electric: "#3B82F6",
        mute: "#9AA8C7",
        secondary: "#C3CCE0",
        cream: "#F7F9FC",
        danger: "#FB7185",
        mint: "#5EE9B5",
        warning: "#F5C76B",
        info: "#60A5FA",
        line: "rgba(154,168,199,0.14)",
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
