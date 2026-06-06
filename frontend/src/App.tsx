import { Route, Routes, useLocation } from "react-router-dom";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import ErrorBoundary from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Screener from "./pages/Screener";
import Watchlist from "./pages/Watchlist";
import More from "./pages/More";
import Assistant from "./pages/Assistant";
import RiskCalculator from "./pages/RiskCalculator";
import Backtester from "./pages/Backtester";
import TradeJournal from "./pages/TradeJournal";
import OrderFlow from "./pages/OrderFlow";
import LiveScanner from "./pages/LiveScanner";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Placeholder from "./pages/Placeholder";

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-4 pt-4 pb-24">
        {/* keyed so the boundary resets when navigating to a new route */}
        <ErrorBoundary key={pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/journal" element={<TradeJournal />} />
            <Route path="/more" element={<More />} />
            <Route path="/risk" element={<RiskCalculator />} />
            <Route path="/orderflow" element={<OrderFlow />} />
            <Route path="/backtester" element={<Backtester />} />
            <Route path="/scanner" element={<LiveScanner />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="*" element={<Placeholder title="Not Found" hint="That page doesn't exist." />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}
