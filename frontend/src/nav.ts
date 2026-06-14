import {
  LayoutDashboard, ScanSearch, Star, BookOpen, Sparkles,
  Calculator, Activity, History, Radar, ListChecks, FileText, Grid3x3, CandlestickChart, Layers, PenTool,
} from "lucide-react";

export interface NavItem { path: string; label: string; icon: any; }

// Primary items shown in the bottom bar (5 max for mobile ergonomics)
export const PRIMARY: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/charts", label: "Charts", icon: CandlestickChart },
  { path: "/screener", label: "Screener", icon: ScanSearch },
  { path: "/watchlist", label: "Watchlist", icon: Star },
  { path: "/more", label: "More", icon: Grid3x3 },
];

// Secondary items shown on the "More" page
export const SECONDARY: NavItem[] = [
  { path: "/patterns", label: "Pattern Finder", icon: PenTool },
  { path: "/options", label: "Options / OI", icon: Layers },
  { path: "/journal", label: "Trade Journal", icon: BookOpen },
  { path: "/risk", label: "Risk Calculator", icon: Calculator },
  { path: "/orderflow", label: "Order Flow", icon: Activity },
  { path: "/backtester", label: "Backtester", icon: History },
  { path: "/scanner", label: "Live Scanner", icon: Radar },
  { path: "/tasks", label: "Tasks & Checklist", icon: ListChecks },
  { path: "/reports", label: "Reports", icon: FileText },
  { path: "/assistant", label: "AI Assistant", icon: Sparkles },
];

export const ALL = [...PRIMARY.filter((p) => p.path !== "/more"), ...SECONDARY];
