import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Loader2, Star } from "lucide-react";
import { listWatch, addWatch, removeWatch } from "../lib/watchlist";
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Card, Skeleton, Empty } from "../components/ui";
import { fmt, signColor, arrow } from "../lib/format";

const PERIODS = ["1mo", "3mo", "6mo", "1y"];

export default function StockDetail() {
  const { symbol = "" } = useParams();
  const nav = useNavigate();
  const [period, setPeriod] = useState("6mo");
  const { data, loading, error } = useFetch(() => api.history(symbol, period), [symbol, period]);
  const [ai, setAi] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const clean0 = symbol.replace(".NS", "").toUpperCase();
  const [watched, setWatched] = useState(false);
  useEffect(() => { listWatch().then((l) => setWatched(l.includes(clean0))); }, [clean0]);
  const toggleWatch = async () => {
    if (watched) { await removeWatch(clean0); setWatched(false); }
    else { await addWatch(clean0); setWatched(true); }
  };

  const analyze = async () => {
    setAiLoading(true);
    try { setAi((await api.analysis(symbol)).analysis); }
    catch { setAi("Analysis unavailable — check the backend / GROQ_API_KEY."); }
    finally { setAiLoading(false); }
  };

  const clean = symbol.replace(".NS", "");
  const stat = (label: string, val: any, cls = "text-txt") => (
    <div><div className="label">{label}</div><div className={`font-mono text-sm mt-1 ${cls}`}>{val}</div></div>
  );

  return (
    <div>
      <button onClick={() => nav(-1)} className="flex items-center gap-1.5 text-faint hover:text-brand text-xs font-mono mb-3 cursor-pointer transition-colors">
        <ArrowLeft size={14} /> Back
      </button>

      {loading && <Skeleton h={320} />}
      {error && <Empty msg="Couldn't load this symbol." />}

      {data && (
        <>
          <div className="flex items-end justify-between mb-3">
            <div>
              <h1 className="font-display text-2xl text-txt tracking-wide">{clean}</h1>
              <div className={`font-mono text-sm ${signColor(data.pct)}`}>
                ₹{fmt(data.last)} <span className="ml-1">{arrow(data.pct)} {fmt(data.change)} ({data.pct >= 0 ? "+" : ""}{fmt(data.pct)}%)</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={toggleWatch} aria-label="Toggle watchlist"
                className={`p-1.5 rounded-md cursor-pointer transition-colors ${watched ? "text-gold" : "text-faint hover:text-gold"}`}>
                <Star size={16} fill={watched ? "#fbbf24" : "none"} />
              </button>
              {PERIODS.map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-md text-[0.65rem] font-mono cursor-pointer transition-colors ${period === p ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{p}</button>
              ))}
            </div>
          </div>

          <Card className="mb-3">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data.candles}>
                <defs>
                  <linearGradient id="px" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e2d44" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#64748b" }} minTickGap={40} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} width={44} orientation="right" />
                <Tooltip contentStyle={{ background: "#0B1220", border: "1px solid #1e2d44", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, n: any) => [`₹${fmt(v)}`, n === "c" ? "Close" : n === "e20" ? "EMA20" : "EMA50"]} />
                <Area type="monotone" dataKey="c" stroke="#22d3ee" strokeWidth={2} fill="url(#px)" />
                <Line type="monotone" dataKey="e20" stroke="#fbbf24" strokeWidth={1} dot={false} />
                <Line type="monotone" dataKey="e50" stroke="#94a3b8" strokeWidth={1} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card className="mb-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {stat("RSI", data.rsi, (data.rsi ?? 50) > 70 ? "text-down" : (data.rsi ?? 50) < 30 ? "text-up" : "text-txt")}
              {stat("ADX", data.adx, (data.adx ?? 0) > 25 ? "text-up" : "text-muted")}
              {stat("EMA50", fmt(data.ema50))}
              {stat("EMA200", data.ema200 ? fmt(data.ema200) : "—")}
              {stat("52w High", fmt(data.high_52w), "text-muted")}
              {stat("52w Low", fmt(data.low_52w), "text-muted")}
            </div>
          </Card>

          <button onClick={analyze} disabled={aiLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand/15 border border-brand/40 px-4 py-2.5 text-sm text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50 mb-3">
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {aiLoading ? "AXIOM analysing…" : "AI Analysis"}
          </button>

          {ai && <Card><pre className="whitespace-pre-wrap font-sans text-sm text-txt leading-relaxed">{ai}</pre></Card>}
        </>
      )}
    </div>
  );
}
