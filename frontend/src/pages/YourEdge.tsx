import { useEffect, useMemo, useState } from "react";
import { Brain, AlertTriangle, Loader2 } from "lucide-react";
import { Section, Card, Empty } from "../components/ui";
import { listTrades, type Trade } from "../lib/trades";
import { computeEdge, type EdgeBucket } from "../lib/edge";
import { fmtInt } from "../lib/format";

const tone = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-faint");

function BucketRow({ b }: { b: EdgeBucket }) {
  return (
    <div className="flex items-center gap-2 text-[0.66rem] font-mono py-1 border-b border-line/40 last:border-0">
      <span className="text-muted flex-1 truncate">{b.key}</span>
      <span className="text-faint w-10 text-right">{b.n}t</span>
      <span className="text-faint w-14 text-right">{b.winRate.toFixed(0)}% W</span>
      <span className={`w-20 text-right ${tone(b.expectancy)}`}>{b.expectancy >= 0 ? "+" : ""}₹{fmtInt(b.expectancy)}/t</span>
    </div>
  );
}

export default function YourEdge() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  useEffect(() => { listTrades().then(setTrades); }, []);
  const e = useMemo(() => (trades ? computeEdge(trades) : null), [trades]);

  if (!trades) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-faint" /></div>;
  if (trades.length < 5)
    return <Section title="Your Edge"><Empty msg={`Log at least 5 trades to surface behavioral patterns. You have ${trades.length}.`} /></Section>;

  const TiltCard = ({ label, s }: { label: string; s: { n: number; winRate: number; expectancy: number } }) => (
    <Card><div className="label">{label}</div>
      {s.n ? <><div className={`font-display text-base mt-1 ${tone(s.expectancy)}`}>{s.expectancy >= 0 ? "+" : ""}₹{fmtInt(s.expectancy)}</div>
        <div className="font-mono text-[0.58rem] text-faint mt-0.5">{s.winRate.toFixed(0)}% win · {s.n} trades</div></> : <div className="text-faint font-mono text-[0.66rem] mt-2">—</div>}
    </Card>
  );

  return (
    <Section title="Your Edge" right={<span className="font-mono text-[0.6rem] text-faint">{trades.length} trades analyzed</span>}>
      {/* Biggest leaks */}
      {e!.leaks.length > 0 && (
        <Card className="mb-3 border-l-2 border-l-down">
          <div className="flex items-center gap-1.5 mb-2"><AlertTriangle size={14} className="text-down" /><span className="font-display text-sm text-txt">Biggest leaks</span></div>
          <div className="flex flex-col gap-2">
            {e!.leaks.slice(0, 3).map((l, i) => (
              <div key={i} className="text-[0.72rem]"><span className="font-mono text-down">{l.label}</span> <span className="text-muted">— {l.detail}</span></div>
            ))}
          </div>
        </Card>
      )}

      {/* Tilt */}
      <div className="flex items-center gap-1.5 mb-2"><Brain size={13} className="text-brand" /><span className="label">Discipline — does emotion cost you?</span></div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <TiltCard label="After a win" s={e!.tilt.afterWin} />
        <TiltCard label="After a loss" s={e!.tilt.afterLoss} />
        <TiltCard label="After 2+ losses" s={e!.tilt.afterStreak} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {e!.sizeBuckets.length === 3 && (
          <Card><div className="label mb-1.5">Position sizing discipline</div>{e!.sizeBuckets.map((b) => <BucketRow key={b.key} b={b} />)}
            <div className="text-[0.55rem] text-faint mt-1.5 font-mono">If "Large" is worst, you size up at the wrong times.</div></Card>
        )}
        <Card><div className="label mb-1.5">Edge by setup</div>{e!.bySetup.length ? e!.bySetup.map((b) => <BucketRow key={b.key} b={b} />) : <div className="text-faint text-[0.66rem] font-mono">Need ≥2 trades per setup.</div>}</Card>
        <Card><div className="label mb-1.5">Best & worst symbols</div>{e!.bySymbol.length ? [...e!.bySymbol.slice(0, 3), ...e!.bySymbol.slice(-3)].filter((b, i, a) => a.indexOf(b) === i).map((b) => <BucketRow key={b.key} b={b} />) : <div className="text-faint text-[0.66rem] font-mono">Need ≥2 trades per symbol.</div>}</Card>
        <Card><div className="label mb-1.5">Long vs Short</div>{e!.bySide.map((b) => <BucketRow key={b.key} b={b} />)}</Card>
      </div>
    </Section>
  );
}
