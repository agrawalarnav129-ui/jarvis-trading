import { Route, Routes } from "react-router-dom";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import Dashboard from "./pages/Dashboard";
import Screener from "./pages/Screener";
import Watchlist from "./pages/Watchlist";
import More from "./pages/More";
import Assistant from "./pages/Assistant";
import RiskCalculator from "./pages/RiskCalculator";
import Backtester from "./pages/Backtester";
import Placeholder from "./pages/Placeholder";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-4 pt-4 pb-24">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/screener" element={<Screener />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/journal" element={<Placeholder title="Trade Journal" hint="Log trades, P&L analytics & AI review." />} />
          <Route path="/more" element={<More />} />
          <Route path="/risk" element={<RiskCalculator />} />
          <Route path="/orderflow" element={<Placeholder title="Order Flow" hint="Approximated footprint / volume profile." />} />
          <Route path="/backtester" element={<Backtester />} />
          <Route path="/scanner" element={<Placeholder title="Live Scanner" hint="Intraday 15-min signal scanner." />} />
          <Route path="/tasks" element={<Placeholder title="Tasks & Checklist" hint="Pre / post-market checklists." />} />
          <Route path="/reports" element={<Placeholder title="Reports" hint="PDF briefings & exports." />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="*" element={<Placeholder title="Not Found" hint="That page doesn't exist." />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
