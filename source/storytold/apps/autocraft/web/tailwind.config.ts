import type { Config } from "tailwindcss";

// Token names follow ArtCraft's `ui-*` / `base-fg` scheme (apps/artcraft/tailwind.config.ts);
// values live in src/styles/tokens.css so both themes share one class vocabulary.
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", ".theme-dark"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",
      bg: "var(--st-bg)",
      panel: "var(--st-panel)",
      raised: "var(--st-raised)",
      sunken: "var(--st-sunken)",
      controls: rgb("--st-controls-rgb"),
      ink: rgb("--st-fg-rgb"),
      inv: rgb("--st-inv-rgb"),
      line: "var(--st-line)",
      "line-strong": "var(--st-line-strong)",
      accent: rgb("--st-accent-rgb"),
      "accent-ink": rgb("--st-accent-ink-rgb"),
      ok: rgb("--st-ok-rgb"),
      merged: rgb("--st-merged-rgb"),
      warn: rgb("--st-warn-rgb"),
      bad: rgb("--st-bad-rgb"),
      c1: "var(--st-c1)",
      c2: "var(--st-c2)",
      c3: "var(--st-c3)",
      c4: "var(--st-c4)",
      c5: "var(--st-c5)",
    },
    fontFamily: {
      sans: ["Inter Variable", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      mono: ["Geist Mono Variable", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
    },
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "3px",
      md: "4px",
      lg: "6px",
      full: "9999px",
    },
    extend: {
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "22px" }],
        lg: ["17px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "30px" }],
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        emphasis: "var(--ease-emphasis)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        rise: { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "none" } },
      },
      animation: {
        fadeIn: "fadeIn var(--dur-base) var(--ease-out)",
        rise: "rise var(--dur-base) var(--ease-out)",
      },
    },
  },
  // lucide-react adds this class at runtime; keep the sizing rule in app.css (as ArtCraft does).
  safelist: ["lucide"],
  plugins: [],
} satisfies Config;
