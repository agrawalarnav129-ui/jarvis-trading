import { Radar, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import { fmt } from "../lib/format";

const SIGNAL_STYLE: Record<string, string> = {
  BREAKOUT: "bg-up/15 text-up border-up/40",
  BB_SQUEEZE_SETUP: "bg-brand/15 text-brand border-brand/40",
  MOMENTUM_CONT: "bg-gold/15 text-gold border-gold/40",
};
const SIGNAL_LABEL: Record<string, string> = {
  BREAKOUT: "BREAKOUT", BB_SQUEEZE_SETUP: "BB SQUEEZE", MOMENTUM_CONT: "MOMENTUM",
};

export default function LiveScanner() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try { setData(await api.scan()); }
    catch { setErr("Scanner unavailable — ensure the watchlist is populated and the API is running."); }
    finally { setLoading(false); }
  };

  const withSignals = (data?.results ?? []).filter((r: any) => r.signals.length > 0);
  const quiet = (data?.results ?? []).filter((r: any) => r.signals.length === 0);

  return (
    <Section title="Live Scanner · 15-min Signals" right={
      <button onClick={run} disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}{loading ? "Scanning…" : "Scan Now"}
      </button>
    }>
      {err && <Card><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!data && !loading && !err && <Empty msg="Scan the watchlist for live breakout / squeeze / momentum signals on the 15-min timeframe." />}

      {data && (
        <>
          <div className="label mb-2">Scanned {data.count} symbols · {data.ist} IST · {withSignals.length} firing</div>

          {withSignals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
              {withSignals.map((r: any) => (
                <Card key={r.symbol} className="border-l-2 border-l-brand">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-txt">{r.symbol}</span>
                    <span className="font-mono text-xs text-muted">₹{fmt(r.close, 1)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {r.signals.map((s: string) => (
                      <span key={s} className={`pill border ${SIGNAL_STYLE[s] ?? "bg-elevated text-muted border-line"}`}>{SIGNAL_LABEL[s] ?? s}</span>
                    ))}
                  </div>
                  <div className="font-mono text-[0.62rem] text-faint">RSI {r.rsi} · ADX {r.adx} · Vol {r.vol_ratio}× · MACD {r.macd_hist}</div>
                </Card>
              ))}
            </div>
          ) : <Empty msg="No signals firing right now across the watchlist." />}

          {quiet.length > 0 && (
            <Card className="p-0 overflow-x-auto scroll-thin">
              <table className="w-full text-left">
                <thead><tr className="text-faint border-b border-line">
                  {["Symbol", "Close", "RSI", "ADX", "Vol×"].map((h) => <th key={h} className="label py-2 px-3">{h}</th>)}
                </tr></thead>
                <tbody>
                  {quiet.map((r: any) => (
                    <tr key={r.symbol} className="border-b border-line/40">
                      <td className="py-1.5 px-3 font-mono text-xs text-muted">{r.symbol}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-faint">₹{fmt(r.close, 1)}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-faint">{r.rsi}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-faint">{r.adx}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-faint">{r.vol_ratio}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </Section>
  );
}
