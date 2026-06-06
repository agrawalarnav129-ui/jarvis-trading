import { Construction } from "lucide-react";

export default function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <Construction size={34} className="text-brand mb-4 opacity-80" />
      <h1 className="font-display text-xl text-txt tracking-wide">{title}</h1>
      <p className="text-muted text-sm mt-2 max-w-xs">{hint}</p>
      <p className="label mt-4">Migrating from Streamlit — coming next</p>
    </div>
  );
}
