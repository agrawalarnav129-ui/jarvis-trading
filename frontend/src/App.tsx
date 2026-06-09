import { lazy, Suspense, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import ErrorBoundary from "./components/ErrorBoundary";
import PullToRefresh from "./components/PullToRefresh";
import { useAlertsToggle, useSignalAlerts } from "./lib/alerts";
import Dashboard from "./pages/Dashboard"; // eager — it's the landing page

const Screener = lazy(() => import("./pages/Screener"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const More = lazy(() => import("./pages/More"));
const Assistant = lazy(() => import("./pages/Assistant"));
const RiskCalculator = lazy(() => import("./pages/RiskCalculator"));
const Backtester = lazy(() => import("./pages/Backtester"));
const TradeJournal = lazy(() => import("./pages/TradeJournal"));
const OrderFlow = lazy(() => import("./pages/OrderFlow"));
const LiveScanner = lazy(() => import("./pages/LiveScanner"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Reports = lazy(() => import("./pages/Reports"));
const Charts = lazy(() => import("./pages/Charts"));
const Options = lazy(() => import("./pages/Options"));
const StockDetail = lazy(() => import("./pages/StockDetail"));
const Placeholder = lazy(() => import("./pages/Placeholder"));

const Fallback = () => (
  <div className="flex justify-center py-24 text-faint"><Loader2 className="animate-spin" /></div>
);

export default function App() {
  const { pathname } = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [alertsOn, toggleAlerts] = useAlertsToggle();
  useSignalAlerts(alertsOn);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar alertsOn={alertsOn} onToggleAlerts={toggleAlerts} />
      <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-4 pt-4 pb-24">
        <PullToRefresh onRefresh={() => setRefreshKey((k) => k + 1)}>
        <ErrorBoundary key={`${pathname}-${refreshKey}`}>
          <Suspense fallback={<Fallback />}>
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
              <Route path="/charts" element={<Charts />} />
              <Route path="/options" element={<Options />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/stock/:symbol" element={<StockDetail />} />
              <Route path="*" element={<Placeholder title="Not Found" hint="That page doesn't exist." />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        </PullToRefresh>
      </main>
      <BottomNav />
    </div>
  );
}
