import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty, Skeleton } from "../components/ui";

const gradeColor: Record<string, string> = { A: "text-up", B: "text-gold" };

export default function Watchlist() {
  const { data, loading } = useFetch(() => api.watchlist(), []);
  if (loading) return <Section title="Watchlist"><Skeleton h={300} /></Section>;
  const rows = data?.watchlist ?? [];
  return (
    <Section title="Watchlist · Grade A/B Candidates">
      {!rows.length ? <Empty msg="Watchlist empty — run the screener to populate." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {rows.map((r: any, i: number) => (
            <Card key={i} className="flex items-center justify-between hover:border-brand/40 transition-colors cursor-pointer">
              <div>
                <div className="font-mono text-sm text-txt">{String(r.symbol).replace(".NS", "")}</div>
                <div className="label mt-1">Score {r.score} · RS20 {r.rs_20d}</div>
              </div>
              <div className="text-right">
                <div className={`font-display text-base ${gradeColor[r.grade] ?? "text-faint"}`}>{r.grade}</div>
                <div className="font-mono text-[0.7rem] text-muted mt-0.5">₹{Number(r.close).toLocaleString("en-IN")}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}
