import { Component } from "react";
import { AlertTriangle } from "lucide-react";

// Catches any otherwise-unhandled render/lifecycle error anywhere below it
// and shows a recoverable screen instead of React's default: the whole
// page going blank with no next step. That's a real gap for someone
// standing at a job site on a phone — there was previously nothing
// stopping one bad render anywhere in the app from taking all of it down.
// Deliberately a class component; React error boundaries have no hook
// equivalent (getDerivedStateFromError/componentDidCatch only exist on
// classes).
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // This app has no remote error reporting wired up — the console is
    // genuinely the only record of what actually broke, so still log it
    // even though the screen below replaces React's own crash output.
    console.error("Unhandled error caught by ErrorBoundary:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Something broke</h2>
          <p className="text-sm text-slate-500 mb-5">
            This screen hit an unexpected error. Reloading usually fixes it — everything saves as
            you go, so nothing you were working on gets lost.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-4 py-2 hover:bg-amber-400"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
