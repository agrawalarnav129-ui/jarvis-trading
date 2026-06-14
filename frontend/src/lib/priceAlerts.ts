// Click-to-set price alerts. Stored in localStorage, polled against /api/quote
// while signal alerts are enabled; fires a web notification on cross.
import { useEffect, useRef } from "react";
import { api } from "./api";

export interface PriceAlert { id: string; symbol: string; price: number; dir: "above" | "below"; created: number; }

const KEY = "axiom_price_alerts";
const POLL_MS = 60 * 1000;

export function loadAlerts(): PriceAlert[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(a: PriceAlert[]) { localStorage.setItem(KEY, JSON.stringify(a)); window.dispatchEvent(new Event("axiom-alerts-changed")); }

export function alertsFor(symbol: string): PriceAlert[] {
  return loadAlerts().filter((a) => a.symbol === symbol);
}
export function addAlert(symbol: string, price: number, dir: "above" | "below"): PriceAlert {
  const a: PriceAlert = { id: `${symbol}-${price}-${Date.now()}`, symbol, price, dir, created: Date.now() };
  save([...loadAlerts(), a]);
  return a;
}
export function removeAlert(id: string) { save(loadAlerts().filter((a) => a.id !== id)); }

async function notify(title: string, body: string) {
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
    if (reg) await reg.showNotification(title, { body, icon: "/icon-192.png", tag: title });
    else if (Notification.permission === "granted") new Notification(title, { body, icon: "/icon-192.png" });
  } catch { /* noop */ }
}

/** App-wide hook: while enabled, polls quotes for armed symbols and fires + clears triggered alerts. */
export function usePriceAlerts(enabled: boolean) {
  const busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      if (busy.current) return;
      const alerts = loadAlerts();
      if (!alerts.length) return;
      busy.current = true;
      try {
        const syms = [...new Set(alerts.map((a) => a.symbol))];
        const { quotes } = await api.quote(syms);
        const px: Record<string, number> = {};
        for (const q of quotes) px[q.symbol] = q.ltp;
        const triggered = alerts.filter((a) => {
          const p = px[a.symbol]; if (p == null) return false;
          return a.dir === "above" ? p >= a.price : p <= a.price;
        });
        if (triggered.length) {
          for (const t of triggered) notify(`${t.symbol.replace(".NS", "")} ${t.dir} ₹${t.price}`, `LTP ₹${px[t.symbol]} crossed your alert.`);
          save(alerts.filter((a) => !triggered.some((t) => t.id === a.id)));
        }
      } catch { /* market closed / offline */ }
      finally { busy.current = false; }
    };
    tick();
    const id = setInterval(() => { if (alive) tick(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [enabled]);
}
