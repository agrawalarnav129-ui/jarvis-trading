/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables (see index.css) so the whole app supports
        // dark (OLED) + light themes. Triplets keep Tailwind's /opacity working.
        base: "rgb(var(--c-base) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        brandbright: "rgb(var(--c-brandbright) / <alpha-value>)",
        gold: "rgb(var(--c-gold) / <alpha-value>)",
        up: "rgb(var(--c-up) / <alpha-value>)",
        down: "rgb(var(--c-down) / <alpha-value>)",
        txt: "rgb(var(--c-txt) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        display: ["'Nunito'", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(34,211,238,0.18)",
        card: "0 4px 24px rgba(0,0,0,0.45)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
