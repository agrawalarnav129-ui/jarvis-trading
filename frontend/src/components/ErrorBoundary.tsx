import { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/** Catches render errors in any page so one bad screen never white-screens AXIOM. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("AXIOM page error:", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-24 px-6">
          <AlertTriangle size={34} className="text-down mb-4" />
          <h1 className="font-display text-lg text-txt">Something went wrong</h1>
          <p className="text-muted text-sm mt-2 max-w-sm">This screen hit an error. The rest of AXIOM is fine.</p>
          <p className="label mt-3 max-w-md break-words text-faint">{this.state.error.message}</p>
          <button onClick={this.reset}
            className="mt-5 rounded-lg bg-brand/15 border border-brand/40 px-4 py-2 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
