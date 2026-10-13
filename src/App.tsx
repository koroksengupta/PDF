import { Layers, Scissors, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SplitView } from './components/SplitView'
import { StitchView } from './components/StitchView'
import { Toaster } from './components/Toaster'
import { thumbnails } from './lib/thumbnails'

type Mode = 'stitch' | 'split'

const modeFromHash = (): Mode => (window.location.hash === '#split' ? 'split' : 'stitch')

const TABS: { mode: Mode; label: string; icon: typeof Layers; tagline: string }[] = [
  { mode: 'stitch', label: 'Stitch', icon: Layers, tagline: 'Merge, reorder & rotate PDFs' },
  { mode: 'split', label: 'Split', icon: Scissors, tagline: 'Cut one PDF into several' },
]

export default function App() {
  const [mode, setMode] = useState<Mode>(modeFromHash)

  // Keep the active tool in the URL (#split) so it survives reloads and can be linked to.
  useEffect(() => {
    const onHash = () => setMode(modeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const select = (next: Mode) => {
    setMode(next)
    const url = window.location.pathname + window.location.search + (next === 'split' ? '#split' : '')
    window.history.replaceState(null, '', url)
  }

  useEffect(() => () => thumbnails.releaseAll(), [])

  const tagline = TABS.find((t) => t.mode === mode)!.tagline

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Layers className="size-5" aria-hidden />
          </div>
          <div className="hidden min-w-0 sm:block">
            <h1 className="text-lg font-bold leading-tight text-slate-900">PDF Stitch</h1>
            <p className="text-xs text-slate-500">{tagline} — privately, in your browser</p>
          </div>
          <h1 className="sr-only sm:hidden">PDF Stitch</h1>

          <div role="tablist" aria-label="Tool" className="ml-auto flex rounded-xl bg-slate-100 p-1 sm:ml-6">
            {TABS.map(({ mode: m, label, icon: Icon }) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => select(m)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                  mode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 lg:inline-flex">
            <ShieldCheck className="size-3.5" aria-hidden /> 100% local · nothing is uploaded
          </span>
        </div>
      </header>

      {/* Both tools stay mounted so switching tabs never loses work. */}
      <StitchView active={mode === 'stitch'} />
      <SplitView active={mode === 'split'} />
      <Toaster />
    </div>
  )
}
