// Theme store — dark (default OLED) / light. Persists to localStorage and
// toggles a class on <html>; the no-flash init runs in index.html before paint.
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "axiom_theme";
const listeners = new Set<() => void>();

let current: Theme = ((): Theme => {
  try { return (localStorage.getItem(KEY) as Theme) || "dark"; } catch { return "dark"; }
})();

export function getTheme(): Theme { return current; }

export function applyTheme(t: Theme): void {
  current = t;
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  const r = document.documentElement;
  r.classList.remove("light", "dark");
  r.classList.add(t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#020617" : "#f4f7fb");
  listeners.forEach((l) => l());
}

export function toggleTheme(): void { applyTheme(current === "dark" ? "light" : "dark"); }

/** Subscribe to theme changes (re-renders the caller, e.g. to re-theme charts). */
export function useTheme(): Theme {
  const [t, setT] = useState(current);
  useEffect(() => {
    const l = () => setT(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return t;
}

/** Resolve a CSS color variable (RGB triplet) to an rgb()/rgba() string for canvas charts. */
export function cssRGB(varName: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "148 163 184";
  return alpha >= 1 ? `rgb(${v})` : `rgba(${v.split(" ").join(",")}, ${alpha})`;
}

// Ensure the class is set even if the inline script didn't run (e.g. SSR/dev).
if (typeof document !== "undefined") applyTheme(current);
