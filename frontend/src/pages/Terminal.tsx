import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, type CompanyResp } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import SymbolSearch from "../components/SymbolSearch";

// ── Bloomberg-inspired palette (intentionally fixed, independent of app theme) ──
const T = {
  bg: "#000000", panel: "#0a0a0a", line: "#26221a",
  amber: "#ff9f0a", amberDim: "#b37400", txt: "#e8e6e1", dim: "#8a877f",
  up: "#00d26a", down: "#ff453a", blue: "#64a0ff",
};

const fmtN = (v?: number | null, dec = 2) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: dec }));
const pct = (v?: number | null, mult = 100) => (v == null ? "—" : `${(v * mult).toFixed(1)}%`);
const cr = (v?: number | null) => (v == null ? "—" : v >= 1e12 ? `₹${(v / 1e12).toFixed(2)} L Cr` : v >= 1e7 ? `₹${(v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr` : `₹${fmtN(v, 0)}`);

function Row({ l, v, color }: { l: string; v: string; color?: string }) {
  return (
    <div className="flex justify-between gap-2 py-[3px] border-b" style={{ borderColor: T.line }}>
      <span className="text-[0.62rem] uppercase tracking-wider" style={{ color: T.dim }}>{l}</span>
      <span className="text-[0.7rem] font-semibold tabular-nums" style={{ color: color ?? T.txt }}>{v}</span>
    </div>
  );
}

function Sect({ code, title, children }: { code: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border" style={{ background: T.panel, borderColor: T.line }}>
      <div className="flex items-center gap-2 px-2.5 h-7 border-b" style={{ borderColor: T.line }}>
        <span className="text-[0.6rem] font-bold px-1" style={{ background: T.amber, color: "#000" }}>{code}</span>
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.15em]" style={{ color: T.amber }}>{title}</span>
      </div>
      <div className="p-2.5">{children}</div>
    </div>
  );
}

function CompPanel({ sym }: { sym: string }) {
  const { data, loading } = useFetch(() => api.companyPeers(sym), [sym]);
  if (loading) return <Sect code="COMP" title="Peer Comparison"><div className="text-[0.66rem]" style={{ color: T.dim }}>Loading peers… (first load fetches each peer)</div></Sect>;
  if (!data?.available || !data.peers?.length)
    return <Sect code="COMP" title="Peer Comparison"><div className="text-[0.66rem]" style={{ color: T.dim }}>{data?.note || "Peers unavailable."}</div></Sect>;
  return (
    <Sect code="COMP" title={`Peers · ${data.industry ?? ""}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            {["NAME", "MCAP", "P/E", "P/B", "ROE", "REV YoY", "RS"].map((h) => (
              <th key={h} className="text-left text-[0.55rem] pb-1 pr-2" style={{ color: T.dim }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.peers.map((p) => (
              <tr key={p.symbol} className="border-t" style={{ borderColor: T.line, background: p.self ? "rgba(255,159,10,0.08)" : undefined }}>
                <td className="py-1 pr-2 text-[0.62rem] font-semibold" style={{ color: p.self ? T.amber : T.txt }}>{p.symbol}</td>
                <td className="py-1 pr-2 text-[0.6rem] tabular-nums" style={{ color: T.txt }}>{cr(p.market_cap)}</td>
                <td className="py-1 pr-2 text-[0.6rem] tabular-nums" style={{ color: T.txt }}>{fmtN(p.pe, 1)}</td>
                <td className="py-1 pr-2 text-[0.6rem] tabular-nums" style={{ color: T.txt }}>{fmtN(p.pb, 1)}</td>
                <td className="py-1 pr-2 text-[0.6rem] tabular-nums" style={{ color: (p.roe ?? 0) > 0.15 ? T.up : T.txt }}>{pct(p.roe)}</td>
                <td className="py-1 pr-2 text-[0.6rem] tabular-nums" style={{ color: (p.rev_growth ?? 0) >= 0 ? T.up : T.down }}>{pct(p.rev_growth)}</td>
                <td className="py-1 text-[0.6rem] tabular-nums" style={{ color: (p.rs_nifty ?? 1) >= 1 ? T.up : T.down }}>{fmtN(p.rs_nifty, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sect>
  );
}

function AIPanel({ sym }: { sym: string }) {
  const [run, setRun] = useState(false);
  const { data, loading } = useFetch(() => (run ? api.companyAI(sym) : Promise.resolve(null)), [sym, run]);
  const vcolor: Record<string, string> = { QUALITY: T.up, FAIR: T.amber, EXPENSIVE: "#ffd60a", AVOID: T.down };
  return (
    <Sect code="AI" title="AXIOM Read">
      {!run ? (
        <button onClick={() => setRun(true)} className="w-full py-2 text-[0.66rem] font-bold cursor-pointer"
          style={{ background: T.amber, color: "#000" }}>RUN AI ANALYSIS ▸</button>
      ) : loading ? (
        <div className="flex items-center gap-2 text-[0.66rem] py-2" style={{ color: T.amber }}>
          <Loader2 size={13} className="animate-spin" /> ANALYZING {sym}…
        </div>
      ) : !data?.available ? (
        <div className="text-[0.66rem]" style={{ color: T.down }}>{data?.note || "AI read unavailable."}</div>
      ) : (
        <>
          <div className="inline-block text-[0.7rem] font-bold px-2 py-0.5 mb-2"
            style={{ background: vcolor[data.verdict ?? ""] ?? T.dim, color: "#000" }}>{data.verdict}</div>
          <div className="text-[0.66rem] leading-relaxed mb-1.5"><span style={{ color: T.up }}>▲ BULL — </span><span style={{ color: T.txt }}>{data.bull}</span></div>
          <div className="text-[0.66rem] leading-relaxed mb-1.5"><span style={{ color: T.down }}>▼ BEAR — </span><span style={{ color: T.txt }}>{data.bear}</span></div>
          <div className="text-[0.66rem] leading-relaxed mb-1.5"><span style={{ color: T.blue }}>◆ TECH — </span><span style={{ color: T.txt }}>{data.technical}</span></div>
          {(data.flags ?? []).length > 0 && (
            <div className="mt-2 pt-1.5 border-t" style={{ borderColor: T.line }}>
              {(data.flags ?? []).map((f, i) => <div key={i} className="text-[0.62rem]" style={{ color: "#ffd60a" }}>⚑ {f}</div>)}
            </div>
          )}
        </>
      )}
    </Sect>
  );
}

export default function Terminal() {
  const { symbol: pSym } = useParams();
  const nav = useNavigate();
  const [sym, setSym] = useState((pSym || "RELIANCE").toUpperCase());
  const { data: d, loading } = useFetch<CompanyResp>(() => api.company(sym), [sym]);
  const pick = (s: string) => { const clean = s.replace(".NS", "").toUpperCase(); setSym(clean); nav(`/terminal/${clean}`, { replace: true }); };

  const t = d?.tech ?? {};
  const chg = (t.pct_chg as number) ?? 0;
  const trendUp = (t.supertrend_dir as number) === 1;
  const h = d?.holding ?? {};
  const qs = d?.quarters ?? [];
  const maxRev = Math.max(...qs.map((q) => q.revenue ?? 0), 1);

  return (
    <div className="-mx-3 sm:-mx-4 -mt-4 min-h-screen font-mono" style={{ background: T.bg }}>
      {/* command line */}
      <div className="flex items-center gap-2 px-3 py-2 border-b sticky top-14 z-20" style={{ background: T.bg, borderColor: T.amberDim }}>
        <span className="text-[0.7rem] font-bold" style={{ color: T.amber }}>AXIOM&gt;</span>
        <SymbolSearch value={sym} onPick={pick} />
        <span className="text-[0.6rem] px-1.5 py-0.5 font-bold" style={{ background: T.amber, color: "#000" }}>GO</span>
        <span className="ml-auto text-[0.58rem] hidden sm:block" style={{ color: T.dim }}>EQUITY TERMINAL · NSE</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm" style={{ color: T.amber }}>
          <Loader2 size={16} className="animate-spin" /> LOADING {sym}…
        </div>
      ) : !d || !d.available ? (
        <div className="p-6 text-[0.75rem]" style={{ color: T.down }}>{d?.note || `NO DATA FOR ${sym}`}</div>
      ) : (
        <div className="p-3">
          {/* header strip */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3 pb-2 border-b" style={{ borderColor: T.line }}>
            <span className="text-lg font-bold" style={{ color: T.amber }}>{d.symbol}</span>
            <span className="text-[0.78rem]" style={{ color: T.txt }}>{d.name}</span>
            <span className="text-[0.62rem]" style={{ color: T.dim }}>{d.sector} · {d.industry}</span>
            {t.close != null && (
              <span className="ml-auto text-base font-bold tabular-nums" style={{ color: chg >= 0 ? T.up : T.down }}>
                ₹{fmtN(t.close as number)} {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {/* DES */}
            <Sect code="DES" title="Company Profile">
              <div className="text-[0.66rem] leading-relaxed mb-2" style={{ color: T.txt }}>{d.summary || "—"}</div>
              <Row l="Market Cap" v={cr(d.market_cap)} color={T.amber} />
              <Row l="Shares Out" v={d.shares_out ? `${(d.shares_out / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr` : "—"} />
              <Row l="Revenue (TTM)" v={cr(d.revenue)} />
              <Row l="Net Income (TTM)" v={cr(d.net_income)} color={(d.net_income ?? 0) >= 0 ? T.up : T.down} />
              <Row l="52W Range" v={`${fmtN(d.low_52w)} – ${fmtN(d.high_52w)}`} />
            </Sect>

            {/* FA valuation */}
            <Sect code="FA" title="Valuation">
              <Row l="P/E (trailing)" v={fmtN(d.pe)} color={T.amber} />
              <Row l="P/E (forward)" v={fmtN(d.fwd_pe)} />
              <Row l="P/B" v={fmtN(d.pb)} />
              <Row l="EV / EBITDA" v={fmtN(d.ev_ebitda)} />
              <Row l="EPS (TTM)" v={`₹${fmtN(d.eps)}`} />
              <Row l="Book Value" v={`₹${fmtN(d.book_value)}`} />
              <Row l="Dividend Yield" v={d.div_yield != null ? `${fmtN(d.div_yield)}%` : "—"} />
              <Row l="Payout Ratio" v={pct(d.payout)} />
              <Row l="Beta" v={fmtN(d.beta)} />
            </Sect>

            {/* FA performance + health */}
            <Sect code="RATIO" title="Performance & Health">
              <Row l="ROE" v={pct(d.roe)} color={(d.roe ?? 0) > 0.15 ? T.up : T.txt} />
              <Row l="ROA" v={pct(d.roa)} />
              <Row l="Profit Margin" v={pct(d.profit_margin)} />
              <Row l="Operating Margin" v={pct(d.op_margin)} />
              <Row l="Revenue Growth (YoY)" v={pct(d.rev_growth)} color={(d.rev_growth ?? 0) >= 0 ? T.up : T.down} />
              <Row l="Earnings Growth (YoY)" v={pct(d.earn_growth)} color={(d.earn_growth ?? 0) >= 0 ? T.up : T.down} />
              <Row l="Debt / Equity" v={fmtN(d.de)} color={(d.de ?? 0) > 150 ? T.down : T.txt} />
              <Row l="Current Ratio" v={fmtN(d.current_ratio)} />
              <Row l="Total Cash" v={cr(d.total_cash)} />
              <Row l="Total Debt" v={cr(d.total_debt)} />
              <Row l="Free Cash Flow" v={cr(d.fcf)} color={(d.fcf ?? 0) >= 0 ? T.up : T.down} />
            </Sect>

            {/* HDS shareholding */}
            <Sect code="HDS" title="Shareholding">
              {h.promoters != null ? (
                <>
                  <div className="flex h-3 mb-2 overflow-hidden">
                    <div style={{ width: `${(h.promoters ?? 0) * 100}%`, background: T.amber }} title="Promoters/Insiders" />
                    <div style={{ width: `${(h.institutions ?? 0) * 100}%`, background: T.blue }} title="Institutions" />
                    <div style={{ width: `${(h.public ?? 0) * 100}%`, background: "#3a3a3a" }} title="Public/Other" />
                  </div>
                  <Row l="Promoters / Insiders" v={pct(h.promoters)} color={T.amber} />
                  <Row l="Institutions (FII+DII)" v={pct(h.institutions)} color={T.blue} />
                  <Row l="Public / Other" v={pct(h.public)} />
                  <Row l="Institutional Holders" v={fmtN(h.inst_count, 0)} />
                  <div className="text-[0.55rem] mt-2" style={{ color: T.dim }}>Source: Yahoo Finance — insider≈promoter; quarterly FII/DII split not available on free cloud data.</div>
                </>
              ) : <div className="text-[0.66rem]" style={{ color: T.dim }}>Shareholding unavailable.</div>}
            </Sect>

            {/* ERN quarterly */}
            <Sect code="ERN" title="Quarterly Results">
              {qs.length ? (
                <>
                  <div className="flex items-end gap-1.5 h-24 mb-2">
                    {qs.map((q) => (
                      <div key={q.quarter} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex items-end gap-px justify-center" style={{ height: 72 }}>
                          <div style={{ width: "45%", height: `${((q.revenue ?? 0) / maxRev) * 100}%`, background: T.amber }} title={`Rev ${cr(q.revenue)}`} />
                          <div style={{ width: "45%", height: `${(Math.max(q.net_income ?? 0, 0) / maxRev) * 100}%`, background: (q.net_income ?? 0) >= 0 ? T.up : T.down }} title={`PAT ${cr(q.net_income)}`} />
                        </div>
                        <span className="text-[0.5rem]" style={{ color: T.dim }}>{q.quarter.replace(" 20", " '")}</span>
                      </div>
                    ))}
                  </div>
                  {qs.slice(-2).reverse().map((q) => (
                    <Row key={q.quarter} l={q.quarter} v={`Rev ${cr(q.revenue)} · PAT ${cr(q.net_income)}`} color={(q.net_income ?? 0) >= 0 ? T.up : T.down} />
                  ))}
                  <div className="flex gap-3 mt-1.5 text-[0.55rem]" style={{ color: T.dim }}>
                    <span><span style={{ color: T.amber }}>■</span> Revenue</span>
                    <span><span style={{ color: T.up }}>■</span> Net Profit</span>
                  </div>
                </>
              ) : <div className="text-[0.66rem]" style={{ color: T.dim }}>Quarterly data unavailable.</div>}
            </Sect>

            {/* TECH */}
            <Sect code="TECH" title="Technicals">
              <Row l="RSI (14)" v={fmtN(t.rsi14 as number, 1)} color={(t.rsi14 as number) > 70 ? T.down : (t.rsi14 as number) < 30 ? T.up : T.txt} />
              <Row l="ADX (14)" v={fmtN(t.adx14 as number, 1)} />
              <Row l="Supertrend" v={trendUp ? "BULLISH ▲" : "BEARISH ▼"} color={trendUp ? T.up : T.down} />
              <Row l="EMA 20 / 50 / 200" v={`${fmtN(t.ema20 as number, 0)} / ${fmtN(t.ema50 as number, 0)} / ${fmtN(t.ema200 as number, 0)}`} />
              <Row l="MACD Histogram" v={fmtN(t.macd_hist as number, 2)} color={(t.macd_hist as number) >= 0 ? T.up : T.down} />
              <Row l="ATR %" v={t.atr_pct != null ? `${fmtN(t.atr_pct as number)}%` : "—"} />
              <Row l="Volume vs 20D" v={t.vol_ratio != null ? `${fmtN(t.vol_ratio as number)}×` : "—"} />
              <Row l="RS vs NIFTY" v={fmtN(t.rs_nifty as number, 3)} color={(t.rs_nifty as number) >= 1 ? T.up : T.down} />
              <Row l="From 52W High" v={t.pct52h != null ? `${fmtN(t.pct52h as number)}%` : "—"} color={T.down} />
              <Row l="20D Change" v={t.pct_chg20 != null ? `${fmtN(t.pct_chg20 as number)}%` : "—"} color={(t.pct_chg20 as number) >= 0 ? T.up : T.down} />
              <div className="mt-2 flex gap-2">
                <button onClick={() => nav(`/stock/${d.symbol}`)} className="text-[0.6rem] px-2 py-1 font-bold cursor-pointer" style={{ background: T.amber, color: "#000" }}>CHART →</button>
                <button onClick={() => nav("/trade-check")} className="text-[0.6rem] px-2 py-1 font-bold cursor-pointer border" style={{ borderColor: T.amber, color: T.amber }}>TRADE CHECK</button>
              </div>
            </Sect>

            {/* AI read */}
            <AIPanel sym={d.symbol} />

            {/* Peer comparison — spans wider */}
            <div className="md:col-span-2"><CompPanel sym={d.symbol} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
