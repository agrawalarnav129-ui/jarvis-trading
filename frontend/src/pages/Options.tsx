import { useState } from "react";
import { useFetch } from "../lib/useFetch";
import { api } from "../lib/api";
import { Section, Card, Empty, Skeleton } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";

const SYMS = ["NIFTY", "BANKNIFTY"];

export default function Options() {
  const [sym, setSym] = useState("NIFTY");
  const { data, loading } = useFetch(() => api.options(sym), [sym], 120_000);

  const pcrTone = (pcr: number) => (pcr >= 1.2 ? { t: "Bullish (put-heavy)", c: "text-up" } : pcr <= 0.8 ? { t: "Bearish (call-heavy)", c: "text-down" } : { t: "Neutral", c: "text-gold" });

  return (
    <Section title="Options · Open Interest" right={
      <div className="flex gap-1.5">
        {SYMS.map((s) => (
          <button key={s} onClick={() => setSym(s)} className={`px-2.5 py-1 rounded text-[0.65rem] font-mono cursor-pointer transition-colors ${sym === s ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{s}</button>
        ))}
      </div>
    }>
      {loading ? <Skeleton h={300} /> :
        !data || data.available === false ? (
          <Empty msg={data?.note || "Option chain unavailable — the snapshot refreshes during market hours."} />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
              <Card><div className="label">Spot · {data.expiry}</div><div className="font-display text-lg text-txt mt-1">{fmt(data.spot)}</div></Card>
              <Card><div className="label">PCR</div><div className={`font-display text-lg mt-1 ${pcrTone(data.pcr).c}`}>{data.pcr}</div><div className={`text-[0.58rem] font-mono mt-0.5 ${pcrTone(data.pcr).c}`}>{pcrTone(data.pcr).t}</div></Card>
              <Card><div className="label">Max Pain</div><div className="font-display text-lg text-gold mt-1">{fmtInt(data.max_pain)}</div></Card>
              <Card><div className="label">ATM IV</div><div className="font-display text-lg text-txt mt-1">{data.atm_iv ?? "—"}%</div></Card>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <Card className="border-l-2 border-l-up"><div className="label">Support (max Put OI)</div><div className="font-display text-lg text-up mt-1">{fmtInt(data.support)}</div></Card>
              <Card className="border-l-2 border-l-down"><div className="label">Resistance (max Call OI)</div><div className="font-display text-lg text-down mt-1">{fmtInt(data.resistance)}</div></Card>
            </div>

            <Card>
              <div className="flex items-center justify-between mb-2">
                <div className="label">OI by Strike — <span className="text-up">Put</span> vs <span className="text-down">Call</span></div>
                <div className="font-mono text-[0.58rem] text-faint">{data.source}</div>
              </div>
              {(() => {
                const maxOI = Math.max(...data.chain.flatMap((c) => [c.ceOI, c.peOI]), 1);
                return (
                  <div className="flex flex-col gap-px">
                    {data.chain.map((c) => {
                      const atSpot = Math.abs(c.strike - data.spot) === Math.min(...data.chain.map((x) => Math.abs(x.strike - data.spot)));
                      const isMP = c.strike === data.max_pain;
                      return (
                        <div key={c.strike} className="flex items-center gap-1 h-3.5 text-[0.55rem] font-mono">
                          <div className="flex-1 flex justify-end"><div style={{ width: `${(c.peOI / maxOI) * 100}%` }} className="h-2.5 bg-up/55 rounded-l-sm" title={`Put OI ${fmtInt(c.peOI)}`} /></div>
                          <div className={`w-14 text-center ${isMP ? "text-gold font-bold" : atSpot ? "text-brand" : "text-faint"}`}>{c.strike}</div>
                          <div className="flex-1"><div style={{ width: `${(c.ceOI / maxOI) * 100}%` }} className="h-2.5 bg-down/55 rounded-r-sm" title={`Call OI ${fmtInt(c.ceOI)}`} /></div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex justify-between mt-2 label">
                <span>Total Put OI: <span className="text-up">{fmtInt(data.total_pe_oi)}</span></span>
                <span>Total Call OI: <span className="text-down">{fmtInt(data.total_ce_oi)}</span></span>
              </div>
            </Card>
          </>
        )}
    </Section>
  );
}
