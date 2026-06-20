import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Empty, Skeleton } from "./ui";

// Live business-news TV. The backend resolves each channel's current live video
// (and whether it's embeddable); we embed by video id and auto-pick / auto-hop
// to a channel that's actually broadcasting.
const FALLBACK = [
  { name: "Zee Business", id: "UCkXopQ3ubd-rnXnStZqCl2w" },
  { name: "CNBC-TV18", id: "UCmRbHAgG2k2vDUvb3xsEunQ" },
  { name: "ET Now", id: "UCI_mwTKUhicNzFrhm33MzBQ" },
  { name: "Bloomberg TV", id: "UCIALMKvObZNtJ6AmdCLP7Lg" },
  { name: "CNBC Intl", id: "UCF8HUTbUwPKh2Q-KpGOCVGw" },
  { name: "CNBC", id: "UCvJJ_dzjViJCoLf5uKUTwoA" },
  { name: "Yahoo Finance", id: "UCEAZeUIeJs0IjQiqTCdVSIg" },
].map((c) => ({ ...c, live: false, videoId: null as string | null }));

export default function LiveVideo() {
  const live = useFetch(() => api.liveChannels(), [], 180_000);
  const channels = live.data?.channels?.length ? live.data.channels : FALLBACK;
  const playable = channels.filter((c) => c.live && c.videoId);

  const [chId, setChId] = useState<string | null>(null);

  // Keep a live channel selected: pick first_live on load, and auto-hop if the
  // current channel drops off-air. User picks among live channels are respected.
  useEffect(() => {
    if (!live.data) return;
    const cur = channels.find((c) => c.id === chId);
    if (cur?.live && cur.videoId) return;
    setChId(live.data.first_live ?? playable[0]?.id ?? null);
  }, [live.data]); // eslint-disable-line

  const ch = channels.find((c) => c.id === chId) ?? null;
  const src = ch?.videoId
    ? `https://www.youtube.com/embed/${ch.videoId}?autoplay=1&mute=1&playsinline=1&modestbranding=1&rel=0`
    : null;

  return (
    <Panel title="Live TV · Business News" status={playable.length ? "down" : "muted"}
      meta={<span className={playable.length ? "text-down" : "text-faint"}>● {playable.length} LIVE</span>}
      right={playable.length > 0 ? (
        <select value={ch?.id ?? ""} onChange={(e) => setChId(e.target.value)}
          className="bg-base border border-line rounded px-1.5 py-0.5 text-[0.6rem] font-mono text-txt outline-none focus:border-brand/60 cursor-pointer">
          {playable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : undefined} bodyClass="p-0">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        {live.loading && !ch ? <div className="absolute inset-0 grid place-items-center"><Skeleton h={60} /></div>
          : src ? (
            <iframe key={ch!.videoId} src={src} title={`${ch!.name} live`} className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : <div className="absolute inset-0 grid place-items-center"><Empty msg="No business channels are broadcasting live right now." /></div>}
      </div>
      {playable.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1 border-t border-line/60">
          {playable.map((c) => (
            <button key={c.id} onClick={() => setChId(c.id)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[0.58rem] font-mono cursor-pointer transition-colors ${ch?.id === c.id ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>
              <span className="w-1 h-1 rounded-full bg-down" />{c.name}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
