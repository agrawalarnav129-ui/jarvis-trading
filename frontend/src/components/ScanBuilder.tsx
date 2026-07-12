import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Play, Save, FolderOpen, History, Bell } from "lucide-react";
import { api } from "../lib/api";
import { Card, Empty } from "./ui";
import { useSymbolNav } from "./SymbolLink";
import EquityChart from "./EquityChart";
import { listScans, persistScans, type SavedScan } from "../lib/scans";

// ── indicator catalog (column names match the backend engine) ──
const CATALOG: [string, [string, string][]][] = [
  ["Price", [["close", "Close"], ["open", "Open"], ["high", "High"], ["low", "Low"], ["volume", "Volume"]]],
  ["Moving Avg", [["ema5", "EMA 5"], ["ema9", "EMA 9"], ["ema20", "EMA 20"], ["ema50", "EMA 50"], ["ema200", "EMA 200"], ["sma20", "SMA 20"], ["sma50", "SMA 50"], ["sma200", "SMA 200"], ["vwap20", "VWAP"]]],
  ["Momentum", [["rsi14", "RSI 14"], ["rsi7", "RSI 7"], ["rsi21", "RSI 21"], ["macd", "MACD"], ["macd_sig", "MACD signal"], ["macd_hist", "MACD hist"], ["stoch_k", "Stoch %K"], ["stoch_d", "Stoch %D"], ["cci20", "CCI 20"], ["willr14", "Williams %R"]]],
  ["Trend", [["adx14", "ADX 14"], ["di_plus", "+DI"], ["di_minus", "-DI"], ["supertrend", "Supertrend"], ["supertrend_dir", "Supertrend dir (1/-1)"]]],
  ["Volatility", [["atr14", "ATR 14"], ["atr_pct", "ATR %"], ["bb_up", "BB upper"], ["bb_mid", "BB mid"], ["bb_lo", "BB lower"], ["bb_bw", "BB bandwidth"], ["bb_pctb", "BB %B"]]],
  ["Volume", [["vol_ratio", "Vol / 20d avg"], ["vol_ratio5", "Vol / 5d avg"], ["avg_vol20", "Avg vol 20d"], ["obv", "OBV"]]],
  ["Change", [["pct_chg", "% change 1d"], ["pct_chg5", "% change 5d"], ["pct_chg20", "% change 20d"]]],
  ["Levels", [["high20d", "20d high"], ["low20d", "20d low"], ["high52w", "52w high"], ["low52w", "52w low"], ["pct52h", "% from 52w high"], ["pct52l", "% from 52w low"]]],
  ["Rel. Strength", [["rs_nifty", "RS vs NIFTY"], ["rs_nifty5d", "RS chg 5d"], ["rs_nifty20d", "RS chg 20d"]]],
  ["Patterns (true/false)", [["inside_bar", "Inside bar"], ["outside_bar", "Outside bar"], ["nr4", "NR4"], ["nr7", "NR7"], ["hammer", "Hammer"], ["shooting_star", "Shooting star"], ["bullish_engulf", "Bullish engulfing"], ["bearish_engulf", "Bearish engulfing"], ["doji", "Doji"]]],
];
const BOOL_INDS = new Set(CATALOG.find((g) => g[0].startsWith("Patterns"))![1].map(([v]) => v));
const ALL_INDS = CATALOG.flatMap(([, items]) => items);
const OPS: [string, string][] = [["gt", "is above >"], ["lt", "is below <"], ["gte", "≥"], ["lte", "≤"], ["eq", "= equals"], ["x_above", "crosses above"], ["x_below", "crosses below"]];
const UNIVERSES = ["NIFTY 50", "NIFTY 100", "NIFTY 200", "ALL (250)"];

interface Cond { ind: string; op: string; vt: "val" | "ind" | "bool"; val: string; vi: string; lg: "AND" | "OR"; }
const newCond = (lg: "AND" | "OR" = "AND"): Cond => ({ ind: "close", op: "gt", vt: "ind", val: "0", vi: "ema50", lg });

const PRESETS: { name: string; conditions: Cond[] }[] = [
  { name: "Momentum breakout", conditions: [
    { ind: "close", op: "gt", vt: "ind", val: "0", vi: "ema20", lg: "AND" },
    { ind: "rsi14", op: "gt", vt: "val", val: "60", vi: "", lg: "AND" },
    { ind: "adx14", op: "gt", vt: "val", val: "25", vi: "", lg: "AND" },
    { ind: "vol_ratio", op: "gt", vt: "val", val: "1.5", vi: "", lg: "AND" }] },
  { name: "RS leaders pullback", conditions: [
    { ind: "rs_nifty", op: "gt", vt: "val", val: "1.05", vi: "", lg: "AND" },
    { ind: "rsi14", op: "lt", vt: "val", val: "45", vi: "", lg: "AND" },
    { ind: "close", op: "gt", vt: "ind", val: "0", vi: "ema50", lg: "AND" }] },
  { name: "Golden cross + ST up", conditions: [
    { ind: "ema20", op: "x_above", vt: "ind", val: "0", vi: "ema50", lg: "AND" },
    { ind: "supertrend_dir", op: "eq", vt: "val", val: "1", vi: "", lg: "AND" }] },
];


export default function ScanBuilder() {
  const go = useSymbolNav();
  const [universe, setUniverse] = useState("NIFTY 100");
  const [conds, setConds] = useState<Cond[]>(PRESETS[0].conditions);
  const [rows, setRows] = useState<any[] | null>(null);
  const [meta, setMeta] = useState<{ count: number; scanned: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedScan[]>([]);
  useEffect(() => { listScans().then(setSaved); }, []);   // Supabase-synced when signed in
  // backtest
  const [bt, setBt] = useState<{ trades: any[]; equity: { date: string; value: number }[]; stats: Record<string, number> } | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btP, setBtP] = useState({ from_date: "2024-01-01", stop_loss: 3, exit_days: 8, min_rr: 2 });

  const backtest = async () => {
    setBtLoading(true); setBt(null); setErr(null);
    try { setBt(await api.scanBuilderBacktest(universe, conds, btP)); }
    catch { setErr("Backtest takes ~60–120s on the first run (fetches 2y history). Try again or a smaller universe."); }
    finally { setBtLoading(false); }
  };

  const set = (i: number, patch: Partial<Cond>) => setConds(conds.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const onInd = (i: number, ind: string) => set(i, BOOL_INDS.has(ind) ? { ind, vt: "bool" } : { ind, vt: conds[i].vt === "bool" ? "ind" : conds[i].vt });

  const run = async () => {
    setLoading(true); setErr(null); setRows(null);
    try {
      const res = await api.scanBuilder(universe, conds);
      setRows(res.results); setMeta({ count: res.count, scanned: res.scanned });
    } catch { setErr("Scan engine takes ~30–90s for a large universe on the first run. Try again or use a smaller universe."); }
    finally { setLoading(false); }
  };
  const save = () => {
    const name = prompt("Name this scan:")?.trim(); if (!name) return;
    const next = [{ name, universe, conditions: conds }, ...saved.filter((s) => s.name !== name)].slice(0, 20);
    setSaved(next); persistScans(next);
  };
  const loadScan = (s: SavedScan) => { setUniverse(s.universe); setConds(s.conditions as Cond[]); };
  const delScan = (name: string) => { const next = saved.filter((s) => s.name !== name); setSaved(next); persistScans(next); };
  const toggleAlert = (name: string) => {
    const next = saved.map((s) => (s.name === name ? { ...s, alert: !s.alert } : s));
    setSaved(next); persistScans(next);
  };

  return (
    <div>
      {/* presets + saved */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="label">Presets:</span>
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => setConds(p.conditions)} className="text-[0.6rem] font-mono text-faint hover:text-brand border border-line rounded px-2 py-0.5 cursor-pointer">{p.name}</button>
        ))}
        {saved.length > 0 && <span className="label ml-2"><FolderOpen size={10} className="inline" /> Saved:</span>}
        {saved.map((s) => (
          <span key={s.name} className="flex items-center gap-1 text-[0.6rem] font-mono text-gold border border-gold/30 rounded px-1.5 py-0.5">
            <button onClick={() => loadScan(s)} className="cursor-pointer hover:text-brandbright">{s.name}</button>
            <button onClick={() => toggleAlert(s.name)} title={s.alert ? "Alerts ON — Telegram pings new matches every 15 min (market hours)" : "Enable Telegram alerts for this scan"}
              className={`cursor-pointer ${s.alert ? "text-brand" : "text-faint hover:text-brand"}`}><Bell size={10} fill={s.alert ? "currentColor" : "none"} /></button>
            <button onClick={() => delScan(s.name)} className="text-faint hover:text-down cursor-pointer">×</button>
          </span>
        ))}
      </div>

      <Card className="mb-3">
        {/* condition rows */}
        <div className="flex flex-col gap-2">
          {conds.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              {i === 0 ? <span className="w-12 text-[0.6rem] font-mono text-faint">WHERE</span>
                : <select value={c.lg} onChange={(e) => set(i, { lg: e.target.value as any })} className="w-12 bg-base border border-line rounded px-1 py-1 text-[0.6rem] font-mono text-brand outline-none"><option>AND</option><option>OR</option></select>}
              <select value={c.ind} onChange={(e) => onInd(i, e.target.value)} className="bg-base border border-line rounded px-1.5 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60">
                {CATALOG.map(([grp, items]) => <optgroup key={grp} label={grp}>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
              </select>
              {c.vt === "bool" ? <span className="text-[0.66rem] font-mono text-up px-2">is TRUE</span> : (
                <>
                  <select value={c.op} onChange={(e) => set(i, { op: e.target.value })} className="bg-base border border-line rounded px-1.5 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60">
                    {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select value={c.vt} onChange={(e) => set(i, { vt: e.target.value as any })} className="bg-base border border-line rounded px-1.5 py-1 text-[0.6rem] font-mono text-faint outline-none">
                    <option value="val">value</option><option value="ind">indicator</option>
                  </select>
                  {c.vt === "ind"
                    ? <select value={c.vi} onChange={(e) => set(i, { vi: e.target.value })} className="bg-base border border-line rounded px-1.5 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60">
                        {CATALOG.map(([grp, items]) => <optgroup key={grp} label={grp}>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
                      </select>
                    : <input value={c.val} onChange={(e) => set(i, { val: e.target.value })} className="w-20 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" />}
                </>
              )}
              <button onClick={() => setConds(conds.filter((_, j) => j !== i))} className="text-faint hover:text-down cursor-pointer ml-auto"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={() => setConds([...conds, newCond()])} className="flex items-center gap-1 text-[0.65rem] font-mono text-brand cursor-pointer"><Plus size={12} /> add condition</button>
          <select value={universe} onChange={(e) => setUniverse(e.target.value)} className="ml-auto bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60">
            {UNIVERSES.map((u) => <option key={u}>{u}</option>)}
          </select>
          <button onClick={save} title="Save scan" className="p-1.5 rounded border border-line text-faint hover:text-brand cursor-pointer"><Save size={14} /></button>
          <button onClick={run} disabled={loading || !conds.length} className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run scan
          </button>
          <button onClick={backtest} disabled={btLoading || !conds.length} className="flex items-center gap-1.5 rounded-lg bg-gold/15 border border-gold/40 px-3 py-1.5 text-xs text-gold font-medium cursor-pointer hover:bg-gold/25 disabled:opacity-50">
            {btLoading ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />} Backtest
          </button>
        </div>
        {/* backtest params */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line/50">
          <span className="label">Backtest:</span>
          {([["from_date", "From", "date"], ["stop_loss", "Stop %", "number"], ["exit_days", "Exit days", "number"], ["min_rr", "R:R", "number"]] as const).map(([k, lbl, ty]) => (
            <label key={k} className="flex items-center gap-1.5 text-[0.6rem] font-mono text-faint">{lbl}
              <input type={ty} step={k === "min_rr" ? 0.5 : 1} value={(btP as any)[k]} onChange={(e) => setBtP({ ...btP, [k]: ty === "number" ? parseFloat(e.target.value) || 0 : e.target.value })}
                className={`${ty === "date" ? "w-28" : "w-14"} bg-base border border-line rounded px-1.5 py-1 text-[0.62rem] font-mono text-txt outline-none focus:border-brand/60`} />
            </label>
          ))}
        </div>
      </Card>

      {btLoading && <div className="flex items-center justify-center gap-2 text-muted text-sm font-mono py-8"><Loader2 size={16} className="animate-spin" /> Backtesting these conditions over history…</div>}
      {bt && !btLoading && (() => {
        const s = bt.stats;
        const tone = (v: number) => (v >= 0 ? "text-up" : "text-down");
        const Stat = ({ label, value, color = "text-txt" }: any) => (
          <Card><div className="label">{label}</div><div className={`font-display text-base mt-1 tabular-nums ${color}`}>{value}</div></Card>
        );
        return (
          <div className="mb-4">
            <div className="label mb-2">Backtest · {s.total_trades} trades on saved conditions</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
              <Stat label="Win Rate" value={`${s.win_rate}%`} color={s.win_rate >= 45 ? "text-up" : "text-down"} />
              <Stat label="Expectancy" value={`${s.expectancy >= 0 ? "+" : ""}${s.expectancy}%`} color={tone(s.expectancy)} />
              <Stat label="Profit Factor" value={s.profit_factor} color={s.profit_factor >= 1.5 ? "text-up" : s.profit_factor >= 1 ? "text-gold" : "text-down"} />
              <Stat label="Avg R:R" value={s.avg_rr} />
              <Stat label="Max DD" value={`${s.max_drawdown}%`} color="text-down" />
              <Stat label="Total Return" value={`${s.total_return >= 0 ? "+" : ""}${s.total_return}%`} color={tone(s.total_return)} />
            </div>
            {bt.equity.length > 1 && <Card className="mb-3"><div className="label mb-1">Equity curve (₹1L start)</div><EquityChart data={bt.equity.map((e) => e.value)} height={160} /></Card>}
            {bt.trades.length > 0 && (
              <Card className="overflow-x-auto scroll-thin p-0 max-h-[320px] overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-elevated"><tr className="text-faint border-b border-line">
                    {["Symbol", "Entry", "Exit", "Entry ₹", "Exit ₹", "P&L%", "Days", "Why"].map((h) => <th key={h} className="label py-2 px-3 font-mono">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {bt.trades.slice(0, 200).map((t, i) => (
                      <tr key={i} onClick={() => go(t.symbol)} className="border-b border-line/40 hover:bg-elevated/40 cursor-pointer">
                        <td className="py-1.5 px-3 font-mono text-[0.66rem] text-txt">{t.symbol}</td>
                        <td className="py-1.5 px-3 font-mono text-[0.62rem] text-faint">{t.entry_date}</td>
                        <td className="py-1.5 px-3 font-mono text-[0.62rem] text-faint">{t.exit_date}</td>
                        <td className="py-1.5 px-3 font-mono text-[0.62rem] text-muted">{t.entry}</td>
                        <td className="py-1.5 px-3 font-mono text-[0.62rem] text-muted">{t.exit}</td>
                        <td className={`py-1.5 px-3 font-mono text-[0.66rem] ${t.pnl_pct >= 0 ? "text-up" : "text-down"}`}>{t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct}</td>
                        <td className="py-1.5 px-3 font-mono text-[0.62rem] text-muted">{t.days}</td>
                        <td className="py-1.5 px-3 font-mono text-[0.6rem] text-faint">{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        );
      })()}

      {err && <Card className="mb-3"><div className="text-down text-xs font-mono">{err}</div></Card>}
      {loading && <div className="flex items-center justify-center gap-2 text-muted text-sm font-mono py-10"><Loader2 size={16} className="animate-spin" /> Scanning {universe}…</div>}
      {rows && !loading && (
        <>
          <div className="label mb-2">{meta?.count} matches / {meta?.scanned} scanned</div>
          {rows.length === 0 ? <Empty msg="No stocks match these conditions right now." /> : (
            <Card className="overflow-x-auto scroll-thin p-0">
              <table className="w-full text-left">
                <thead><tr className="text-faint border-b border-line">
                  {["Symbol", "Setup", "Price", "Chg%", "RSI", "ADX", "Vol×", "RS", "ATR%", "ST"].map((h) => <th key={h} className="label py-2.5 px-3 font-mono">{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} onClick={() => go(String(r.symbol))} className="border-b border-line/50 hover:bg-elevated/40 cursor-pointer transition-colors">
                      <td className="py-2 px-3 font-mono text-xs text-txt">{r.symbol}</td>
                      <td className="py-2 px-3 font-mono text-[0.62rem] text-brand">{r.setup}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">₹{r.price}</td>
                      <td className={`py-2 px-3 font-mono text-xs ${(r.change ?? 0) >= 0 ? "text-up" : "text-down"}`}>{r.change != null ? (r.change >= 0 ? "+" : "") + r.change : "—"}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">{r.rsi14 ?? "—"}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">{r.adx14 ?? "—"}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">{r.vol_ratio ?? "—"}</td>
                      <td className={`py-2 px-3 font-mono text-xs ${(r.rs_nifty ?? 1) >= 1 ? "text-up" : "text-down"}`}>{r.rs_nifty ?? "—"}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">{r.atr_pct ?? "—"}</td>
                      <td className={`py-2 px-3 font-mono text-xs ${r.supertrend_dir === 1 ? "text-up" : "text-down"}`}>{r.supertrend_dir === 1 ? "↑" : "↓"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
