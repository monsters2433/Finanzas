import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0e1116",
        panel: "#161b22",
        edge: "#242c38",
        muted: "#8b97a8",
        accent: "#4f8cff",
        good: "#3fb950",
        warn: "#d29922",
        bad: "#f85149",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
