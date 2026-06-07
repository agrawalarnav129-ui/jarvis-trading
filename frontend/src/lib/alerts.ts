// Web-notification signal alerts. Polls /api/scan while enabled and notifies
// on newly-firing watchlist signals (foreground / PWA service-worker notifications).
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const ENABLED_KEY = "axiom_alerts_enabled";
const SEEN_KEY = "axiom_alerts_seen"; // { date: 'YYYY-MM-DD', keys: string[] }
const POLL_MS = 3 * 60 * 1000;

export function alertsEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "1";
}

export async function setAlertsEnabled(on: boolean): Promise<boolean> {
  if (on) {
    if (!("Notification" in window)) return false;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
  }
  localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  return on;
}

async function notify(title: string, body: string) {
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
    if (reg) await reg.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: title });
    else if (Notification.permission === "granted") new Notification(title, { body, icon: "/icon-192.png" });
  } catch { /* noop */ }
}

function loadSeen(): Set<string> {
  try {
    const s = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
    const today = new Date().toISOString().slice(0, 10);
    return s.date === today ? new Set<string>(s.keys) : new Set<string>();
  } catch { return new Set<string>(); }
}
function saveSeen(set: Set<string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify({ date: new Date().toISOString().slice(0, 10), keys: [...set] }));
}

/** App-wide hook: polls the scanner and fires notifications for new signals. */
export function useSignalAlerts(enabled: boolean) {
  const seen = useRef<Set<string>>(loadSeen());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const { results } = await api.scan();
        for (const r of results) {
          for (const sig of r.signals) {
            const key = `${r.symbol}:${sig}`;
            if (!seen.current.has(key)) {
              seen.current.add(key);
              notify(`${r.symbol} · ${sig.replace(/_/g, " ")}`, `₹${r.close} · RSI ${r.rsi} · ADX ${r.adx}`);
            }
          }
        }
        saveSeen(seen.current);
      } catch { /* market closed / offline */ }
    };
    tick();
    const id = setInterval(() => { if (alive) tick(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [enabled]);
}

export function useAlertsToggle(): [boolean, () => Promise<void>] {
  const [on, setOn] = useState(alertsEnabled());
  const toggle = async () => {
    const next = await setAlertsEnabled(!on);
    setOn(next);
  };
  return [on, toggle];
}
