import { useState } from "react";
import { ShieldHalf, AlertTriangle, Info } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty } from "../components/ui";
import { fmt } from "../lib/format";
import SymbolLink from "../components/SymbolLink";

// Nothing here decides a rule. Beta, the liquidity gate and the regime all
// come from the backend; this page only renders them. The framing matters as
// much as the numbers — see the note the API returns.

export default function Defensive() {
  const [maxBeta, setMaxBeta] = useState(0.75);
  const { data, loading } = useFetch(() => api.defensive(40, maxBeta), [maxBeta]);

  const bearish = data?.regime === "BEARISH";

  return (
    <Section title="Defensive Board · Lowest Beta to Nifty">
      <Card className="mb-3">
        <div className="flex items-start gap-2">
          <Info size={14} className="text-brand shrink-0 mt-0.5" />
          <div className="label leading-relaxed">
            These names fall <span className="text-txt">less</span> than the index — they do
            not rise when it falls. Stocks with meaningfully negative correlation to the Nifty
            do not exist: across 250 sessions the most negative sits near −0.09. Judge a row by{" "}
            <span className="text-txt">down capture</span> against the index's own down-day
            average, not by beta alone.
          </div>
        </div>
      </Card>

      {bearish && (
        <div className="card p-3 mb-3 border-l-2 border-l-down">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-down shrink-0 mt-0.5" />
            <div className="label leading-relaxed">
              <span className="text-down font-display">Regime is BEARISH.</span> Your rulebook
              (CLAUDE.md §6 and §7) sets position size to 0 and forbids long entries, A-grade
              included. A low-beta name is still a long. This board is for context, not a
              licence to take one.
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <label className="label">Max beta</label>
        <input
          type="range" min={0.1} max={1.2} step={0.05} value={maxBeta}
          onChange={(e) => setMaxBeta(parseFloat(e.target.value))}
          className="flex-1 max-w-[220px] accent-brand"
        />
        <span className="font-mono text-xs text-txt">{fmt(maxBeta, 2)}</span>
        {data && (
          <span className="label ml-auto">
            {data.count} of {data.scanned} scanned
          </span>
        )}
      </div>

      {loading && !data ? (
        <Card><div className="label">Measuring beta over {250} sessions…</div></Card>
      ) : !data?.available ? (
        <Empty msg={data?.note || "No qualifying names."} />
      ) : (
        <>
          <Card className="mb-3">
            <div className="label">
              Index averages{" "}
              <span className="text-down font-mono">
                {fmt(data.results[0]?.bench_down_mean ?? 0, 3)}%
              </span>{" "}
              on its own down days over the last {data.beta_window} sessions. A row beating
              that is falling less; a row above zero held up, which is usually trend drift
              rather than a hedge and reverses with the trend.
            </div>
          </Card>

          <div className="card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label border-b border-line">
                  <th className="py-2 px-3">Symbol</th>
                  <th className="py-2 px-3 text-right">Beta</th>
                  <th className="py-2 px-3 text-right">Corr 250d</th>
                  <th className="py-2 px-3 text-right">Down capture</th>
                  <th className="py-2 px-3 text-right">Up capture</th>
                  <th className="py-2 px-3 text-right">Turnover</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.symbol} className="border-b border-line/40 hover:bg-base/40">
                    <td className="py-2 px-3 font-mono text-xs text-txt">
                      <SymbolLink symbol={r.symbol} />
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${r.beta <= 0 ? "text-up" : "text-txt"}`}>
                      {fmt(r.beta, 2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-muted">
                      {r.corr_250d === null ? "—" : fmt(r.corr_250d, 2)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${(r.down_capture ?? 0) >= 0 ? "text-up" : "text-gold"}`}>
                      {r.down_capture === null ? "—" : `${fmt(r.down_capture, 3)}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-muted">
                      {r.up_capture === null ? "—" : `${fmt(r.up_capture, 3)}%`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-faint">
                      ₹{fmt(r.turnover_cr, 1)}cr
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="label mt-3 flex items-start gap-2">
            <ShieldHalf size={13} className="shrink-0 mt-0.5" />
            <span>
              Up capture is shown beside down capture on purpose: a name that sits out the
              falls usually sits out the rallies too. {data.skipped_illiquid} names were
              excluded for failing the liquidity gate.
            </span>
          </div>
        </>
      )}
    </Section>
  );
}
