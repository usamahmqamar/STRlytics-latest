import React from 'react';
import { reportError } from '../lib/monitoring';

/** Catches a crash in part of the app, reports it, and offers a way back instead of a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; area?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Screen error:', error);
    reportError(error, { area: this.props.area ?? 'app', componentStack: info.componentStack?.slice(0, 2000) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-16 max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">This screen ran into a problem</p>
        <p className="mt-2 text-sm text-zinc-500">
          Your saved data is safe. The problem has been recorded{' '}
          so it can be fixed. Reload to continue.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => window.location.reload()} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">Reload</button>
          <button onClick={() => { this.setState({ failed: false }); window.history.back(); }} className="h-9 rounded-lg border border-zinc-200 px-4 text-sm text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300">Go back</button>
        </div>
      </div>
    );
  }
}
