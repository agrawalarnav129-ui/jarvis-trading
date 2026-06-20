import { useState } from "react";
import { Panel } from "./ui";

// Live business-news TV via each channel's current YouTube live stream
// (embedded, not rehosted). channelId → YouTube's live_stream embed.
const CHANNELS: { name: string; id: string }[] = [
  { name: "Zee Business", id: "UCkXopQ3ubd-rnXnStZqCl2w" },
  { name: "CNBC-TV18", id: "UCmRbHAgG2k2vDUvb3xsEunQ" },
  { name: "Bloomberg TV", id: "UCIALMKvObZNtJ6AmdCLP7Lg" },
  { name: "CNBC", id: "UCvJJ_dzjViJCoLf5uKUTwoA" },
];

export default function LiveVideo() {
  const [ch, setCh] = useState(CHANNELS[0]);
  const src = `https://www.youtube.com/embed/live_stream?channel=${ch.id}&autoplay=0&mute=1&modestbranding=1&rel=0`;
  return (
    <Panel title="Live TV · Business News" status="down" meta={<span className="text-down">● LIVE</span>}
      right={
        <select value={ch.id} onChange={(e) => setCh(CHANNELS.find((c) => c.id === e.target.value) ?? CHANNELS[0])}
          className="bg-base border border-line rounded px-1.5 py-0.5 text-[0.6rem] font-mono text-txt outline-none focus:border-brand/60 cursor-pointer">
          {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      } bodyClass="p-0">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <iframe key={ch.id} src={src} title={`${ch.name} live`} className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <div className="px-3 py-1.5 flex flex-wrap gap-1 border-t border-line/60">
        {CHANNELS.map((c) => (
          <button key={c.id} onClick={() => setCh(c)}
            className={`px-2 py-0.5 rounded text-[0.58rem] font-mono cursor-pointer transition-colors ${ch.id === c.id ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{c.name}</button>
        ))}
      </div>
    </Panel>
  );
}
