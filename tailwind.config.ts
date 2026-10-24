import type { Config } from "tailwindcss";

/**
 * Theme keys point at src/styles/universe-tokens.css.
 * Prefer bg-ts-canvas / text-ts-ink / bg-ts-accent / rounded-ts-* / max-w-ts
 * over raw hex. See the token file for how to reuse this in wxm-app.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ts: {
          canvas: "var(--ts-canvas)",
          surface: "var(--ts-surface)",
          ink: "var(--ts-ink)",
          secondary: "var(--ts-ink-secondary)",
          accent: "var(--ts-accent)",
          highlight: "var(--ts-highlight)",
          muted: "var(--ts-muted)",
          /* Legacy keys, same variables. */
          black: "var(--ts-ink)",
          white: "var(--ts-surface)",
          bg: "var(--ts-canvas)",
          gray: "var(--ts-canvas)",
          dark100: "var(--ts-ink)",
          dark80: "var(--ts-ink-secondary)",
          dark60: "rgba(8, 20, 32, 0.6)",
        },
      },
      borderRadius: {
        "ts-sm": "var(--ts-radius-sm)",
        "ts-md": "var(--ts-radius-md)",
        "ts-lg": "var(--ts-radius-lg)",
        "ts-xl": "var(--ts-radius-xl)",
      },
      maxWidth: {
        ts: "var(--ts-content-max)",
      },
      letterSpacing: {
        "ts-tight": "-0.02em",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
