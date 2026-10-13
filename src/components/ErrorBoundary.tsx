import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface State {
  error: Error | null
}

/** Last line of defence: a render crash shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PDF Stitch crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200">
          <AlertTriangle className="mx-auto size-10 text-amber-500" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The app hit an unexpected error. Your files never left this device; reloading will
            start a fresh workspace.
          </p>
          <p className="mt-3 break-words rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-500">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <RotateCcw className="size-4" aria-hidden /> Reload
          </button>
        </div>
      </div>
    )
  }
}
