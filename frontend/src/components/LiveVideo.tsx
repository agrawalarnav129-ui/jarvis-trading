import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel } from "./ui";

// Live business-news TV via each channel's current YouTube live stream
// (embedded, not rehosted). Auto-picks a channel that's actually broadcasting.
const CHANNELS: { name: string; id: string }[] = [
  { name: "Zee Business", id: "UCkXopQ3ubd-rnXnStZqCl2w" },
  { name: "CNBC-TV18", id: "UCmRbHAgG2k2vDUvb3xsEunQ" },
  { name: "ET Now", id: "UCI_mwTKUhicNzFrhm33MzBQ" },
  { name: "Bloomberg TV", id: "UCIALMKvObZNtJ6AmdCLP7Lg" },
  { name: "CNBC Intl", id: "UCF8HUTbUwPKh2Q-KpGOCVGw" },
  { name: "CNBC", id: "UCvJJ_dzjViJCoLf5uKUTwoA" },
  { name: "Yahoo Finance", id: "UCEAZeUIeJs0IjQiqTCdVSIg" },
];

export default function LiveVideo() {
  const live = useFetch(() => api.liveChannels(), [], 300_000);
  const channels = live.data?.channels?.length ? live.data.channels : CHANNELS.map((c) => ({ ...c, live: false }));
  const liveMap = new Map(channels.map((c) => [c.id, (c as any).live]));

  const [chId, setChId] = useState(CHANNELS[0].id);
  const [userPicked, setUserPicked] = useState(false);

  // auto-pick the first broadcasting channel until the user chooses one
  useEffect(() => {
    if (!userPicked && live.data?.first_live) setChId(live.data.first_live);
  }, [live.data?.first_live, userPicked]);

  const ch = channels.find((c) => c.id === chId) ?? channels[0];
  const pick = (id: string) => { setUserPicked(true); setChId(id); };
  const src = `https://www.youtube.com/embed/live_stream?channel=${ch.id}&autoplay=1&mute=1&playsinline=1&modestbranding=1&rel=0`;

  return (
    <Panel title="Live TV · Business News" status="down"
      meta={liveMap.get(ch.id) ? <span className="text-down">● LIVE</span> : <span className="text-faint">offline</span>}
      right={
        <select value={ch.id} onChange={(e) => pick(e.target.value)}
          className="bg-base border border-line rounded px-1.5 py-0.5 text-[0.6rem] font-mono text-txt outline-none focus:border-brand/60 cursor-pointer">
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}{liveMap.get(c.id) ? " ●" : ""}</option>)}
        </select>
      } bodyClass="p-0">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <iframe key={ch.id} src={src} title={`${ch.name} live`} className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <div className="px-3 py-1.5 flex flex-wrap gap-1 border-t border-line/60">
        {channels.map((c) => (
          <button key={c.id} onClick={() => pick(c.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.58rem] font-mono cursor-pointer transition-colors ${ch.id === c.id ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>
            {liveMap.get(c.id) && <span className="w-1 h-1 rounded-full bg-down" />}{c.name}
          </button>
        ))}
      </div>
    </Panel>
  );
}
