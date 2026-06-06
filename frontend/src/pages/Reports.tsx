import { useState } from "react";
import { FileText, Loader2, Send, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";

export default function Reports() {
  const [briefing, setBriefing] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setErr(null); setSent(false);
    try {
      const r = await api.briefing();
      setBriefing(r.briefing); setDate(r.date);
    } catch { setErr("Briefing unavailable (the engine fetches cross-asset data; needs GROQ_API_KEY)."); }
    finally { setLoading(false); }
  };

  const send = async () => {
    if (!briefing) return;
    setSending(true); setErr(null);
    try { await api.sendBriefing(briefing); setSent(true); }
    catch { setErr("Telegram send failed — check TELEGRAM_* config on the backend."); }
    finally { setSending(false); }
  };

  return (
    <Section title="Reports · Morning Briefing" right={
      <button onClick={generate} disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3.5 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}{loading ? "Generating…" : "Generate Briefing"}
      </button>
    }>
      {err && <Card className="mb-3"><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!briefing && !loading && !err && <Empty msg="Generate today's institutional cross-asset briefing — then push the PDF to Telegram." />}
      {loading && <div className="flex items-center gap-2 text-muted text-sm font-mono py-10 justify-center"><Loader2 size={16} className="animate-spin" /> AXIOM writing briefing…</div>}

      {briefing && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="label">Generated · {date}</span>
            <button onClick={send} disabled={sending || sent}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors border disabled:opacity-60 ${sent ? "bg-up/15 border-up/40 text-up" : "bg-brand/15 border-brand/40 text-brand hover:bg-brand/25"}`}>
              {sent ? <CheckCircle2 size={14} /> : sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sent ? "Sent to Telegram" : sending ? "Sending…" : "Send PDF to Telegram"}
            </button>
          </div>
          <Card>
            <pre className="whitespace-pre-wrap font-sans text-sm text-txt leading-relaxed max-h-[60vh] overflow-y-auto scroll-thin">{briefing}</pre>
          </Card>
        </>
      )}
    </Section>
  );
}
