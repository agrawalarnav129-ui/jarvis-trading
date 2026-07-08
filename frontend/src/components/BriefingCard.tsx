import { useState } from "react";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton, Empty } from "./ui";

// "AXIOM's Read Today" — the morning briefing surfaced on the dashboard.
export default function BriefingCard() {
  const { data, loading } = useFetch(() => api.briefing(), [], 1800_000);
  const [expanded, setExpanded] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  if (loading) return <Panel title="AXIOM's Read Today"><Skeleton h={140} /></Panel>;
  if (!data?.briefing) return <Panel title="AXIOM's Read Today" status="muted"><Empty msg="Briefing unavailable — check back shortly." /></Panel>;

  const text = data.briefing.trim();
  const preview = text.split("\n").slice(0, 8).join("\n");
  const long = text.split("\n").length > 8;

  const sendTg = async () => {
    setSent("sending…");
    try { const r = await api.sendBriefing(text); setSent(r.sent ? "sent ✓" : "failed"); }
    catch { setSent("failed"); }
    setTimeout(() => setSent(null), 3000);
  };

  return (
    <Panel title="AXIOM's Read Today · AI Briefing" status="info" meta={<span>{data.date}</span>}
      right={
        <button onClick={sendTg} title="Send to Telegram as PDF"
          className="flex items-center gap-1 text-[0.6rem] font-mono text-faint hover:text-brand cursor-pointer transition-colors">
          <Send size={11} />{sent ?? "TG"}
        </button>
      } bodyClass="p-3">
      <pre className="whitespace-pre-wrap font-sans text-[0.78rem] text-txt leading-relaxed">
        {expanded ? text : preview}
      </pre>
      {long && (
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-2 text-[0.62rem] font-mono text-brand cursor-pointer">
          {expanded ? <><ChevronUp size={12} /> collapse</> : <><ChevronDown size={12} /> read full briefing</>}
        </button>
      )}
    </Panel>
  );
}
