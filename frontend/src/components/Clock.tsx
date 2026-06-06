import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/**
 * Live IST clock. Anchors to the server's authoritative IST time once, then
 * ticks locally every second using a monotonic offset — so it keeps moving
 * without re-fetching, and never drifts on a stale page (the old bug).
 */
export default function Clock() {
  const [now, setNow] = useState<Date>(new Date());
  const [marketOpen, setMarketOpen] = useState(false);
  const offsetRef = useRef(0); // serverIST - localTime, in ms

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const c = await api.clock();
        const serverMs = new Date(c.iso).getTime();
        offsetRef.current = serverMs - Date.now();
        if (alive) setMarketOpen(c.market_open);
      } catch {
        offsetRef.current = 0; // fall back to local time
      }
    };
    sync();
    const resync = setInterval(sync, 60_000); // re-anchor every minute
    const tick = setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1000);
    return () => { alive = false; clearInterval(resync); clearInterval(tick); };
  }, []);

  const ist = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short",
  }).format(now);

  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-2 w-2 rounded-full ${marketOpen ? "bg-up animate-pulse-slow" : "bg-gold"}`} />
      <div className="leading-tight">
        <div className="font-mono text-sm text-txt tabular-nums">{ist} <span className="text-faint text-[0.6rem]">IST</span></div>
        <div className="font-mono text-[0.58rem] text-faint">{date} · {marketOpen ? "MARKET OPEN" : "CLOSED"}</div>
      </div>
    </div>
  );
}
