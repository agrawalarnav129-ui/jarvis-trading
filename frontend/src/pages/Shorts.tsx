import { useState } from "react";
import { TrendingDown, AlertTriangle, Info } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";
import SymbolLink from "../components/SymbolLink";

// Grades are deliberately de-emphasised here. On the short side they are not
// selective — one session graded 34% of candidates A against the long
// screener's 2.7% — so pct_rank leads and the grade is a muted chip.

export default function Shorts() {
  const [fnoOnly, setFnoOnly] = useState(true);
  const [capital, setCapital] = useState(1_000_000);
  const { data, loading } = useFetch(() => api.shorts(40, fnoOnly, capital), [fnoOnly, capital]);

  const bullish = data?.regime === "BULLISH";

  return (
    <Section title="Short Candidates · Breakdown & Distribution">
      <Card className="mb-3">
        <div className="flex items-start gap-2">
          <Info size={14} className="text-brand shrink-0 mt-0.5" />
          <div className="label leading-relaxed">
            Grades here are <span className="text-txt">not</span> comparable to the long
            screener's — the same thresholds graded 34% of these A against 2.7% on the long
            side, because the F&amp;O names fall together in a weak tape. Rank on{" "}
            <span className="text-txt">percentile</span>, not grade.
          </div>
        </div>
      </Card>

      {bullish && (
        <div className="card p-3 mb-3 border-l-2 border-l-down">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-down shrink-0 mt-0.5" />
            <div className="label leading-relaxed">
              <span className="text-down font-display">Regime is BULLISH.</span> The risk
              engine blocks short entries here, the mirror of refusing longs in a BEARISH
              tape. These are for the watchlist, not the book.
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <label className="label flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={fnoOnly} onChange={(e) => setFnoOnly(e.target.checked)}
            className="accent-brand" />
          F&amp;O only (holdable overnight)
        </label>
        <label className="label flex items-center gap-2">
          Capital ₹
          <input type="number" value={capital || ""} step={100000}
            onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
            className="w-28 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" />
        </label>
        {data && (
          <span className="label ml-auto">
            {data.count} candidates
            {capital > 0 && data.results && (
              <> · <span className="text-txt">{data.results.filter((r) => r.takeable).length}</span> takeable here</>
            )}
          </span>
        )}
      </div>

      {capital > 0 && data?.available && data.results.every((r) => !r.takeable) && (
        <div className="card p-3 mb-3 border-l-2 border-l-gold">
          <div className="label leading-relaxed">
            <span className="text-gold font-display">Nothing here is placeable at ₹{capital.toLocaleString("en-IN")}.</span>{" "}
            One NSE futures lot of even the cheapest name on this board risks more than
            your 2% cap allows. Futures shorting needs roughly ₹6.2L minimum, and about
            ₹13.5L before a usable number of names open up.
          </div>
        </div>
      )}

      {!fnoOnly && (
        <div className="label mb-3 text-gold">
          Cash-market shorts must be squared off the same session on NSE — anything without
          futures is intraday only.
        </div>
      )}

      {loading && !data ? (
        <Card><div className="label">Scoring short candidates…</div></Card>
      ) : !data?.available ? (
        <Empty msg={data?.note || "No short candidates."} />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label border-b border-line">
                  <th className="py-2 px-3">Symbol</th>
                  <th className="py-2 px-3 text-right">Pctl</th>
                  <th className="py-2 px-3 text-right">Score</th>
                  <th className="py-2 px-3 text-right">RSI</th>
                  <th className="py-2 px-3 text-right">ADX</th>
                  <th className="py-2 px-3 text-right">RS 20d</th>
                  <th className="py-2 px-3 text-right">Entry</th>
                  <th className="py-2 px-3 text-right">Stop</th>
                  <th className="py-2 px-3 text-right">Target</th>
                  <th className="py-2 px-3 text-right">Lot</th>
                  <th className="py-2 px-3 text-right">Size</th>
                  <th className="py-2 px-3">Setup</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.symbol} className="border-b border-line/40 hover:bg-base/40">
                    <td className="py-2 px-3 font-mono text-xs text-txt">
                      <SymbolLink symbol={r.symbol} />
                      {!r.fno && <span className="ml-1 text-gold text-[0.6rem]">intraday</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-txt">
                      {fmt(r.pct_rank, 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-muted">
                      {fmt(r.score, 1)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-muted">
                      {r.rsi === null ? "—" : fmt(r.rsi, 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-muted">
                      {r.adx === null ? "—" : fmt(r.adx, 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-down">
                      {fmt(r.rs_20d, 1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-txt">
                      {fmt(r.entry, 2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-down">
                      {fmt(r.stop, 2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-up">
                      {fmt(r.target, 2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-faint">
                      {r.lot_size ? fmtInt(r.lot_size) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs">
                      {r.takeable === undefined ? "—"
                        : r.takeable
                          ? <span className="text-up">{r.lots}L · {fmt(r.sized_risk_pct ?? 0, 2)}%</span>
                          : <span className="text-faint">over cap</span>}
                    </td>
                    <td className="py-2 px-3 font-mono text-[0.62rem] text-muted truncate max-w-[170px]">
                      {r.setup_flags || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="label mt-3 flex items-start gap-2">
            <TrendingDown size={13} className="shrink-0 mt-0.5" />
            <span>
              Stop sits 1.5 × ATR above entry, target 2R below. Size is in whole futures
              lots rounded down — rounding up is the one direction that breaches the 2%
              cap. "Over cap" means a single lot already risks more than 2% at this
              capital, which no stop adjustment fixes.
            </span>
          </div>
        </>
      )}
    </Section>
  );
}
