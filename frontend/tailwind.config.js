/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#020617",       // OLED deep space
        surface: "#0B1220",
        elevated: "#111c30",
        line: "#1e2d44",
        brand: "#22d3ee",      // cyan accent
        brandbright: "#67e8f9",
        gold: "#fbbf24",
        up: "#22c55e",
        down: "#ef4444",
        txt: "#f1f5f9",
        muted: "#94a3b8",
        faint: "#64748b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        display: ["'Orbitron'", "Inter", "sans-serif"],
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
