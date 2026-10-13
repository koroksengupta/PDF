import { ArrowLeft, Layers, Scissors, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Home } from './components/Home'
import { SplitView } from './components/SplitView'
import { StitchView } from './components/StitchView'
import { Toaster } from './components/Toaster'
import { useIngest } from './hooks/useIngest'
import { sourceStore } from './lib/sourceStore'
import { thumbnails } from './lib/thumbnails'
import type { SourceMeta } from './lib/types'

type Screen = 'home' | 'merge' | 'split'

const HASH: Record<Screen, string> = { home: '', merge: '#merge', split: '#split' }
const screenFromHash = (): Screen =>
  window.location.hash === '#merge' ? 'merge' : window.location.hash === '#split' ? 'split' : 'home'
const urlFor = (screen: Screen) => window.location.pathname + window.location.search + HASH[screen]

const TOOLS = {
  merge: { title: 'Merge PDFs', icon: Layers },
  split: { title: 'Split a PDF', icon: Scissors },
} as const

export default function App() {
  // Files live only in memory, so a reload always starts at the upload screen.
  const [screen, setScreen] = useState<Screen>(() => {
    if (window.location.hash) window.history.replaceState(null, '', urlFor('home'))
    return 'home'
  })
  const [files, setFiles] = useState<SourceMeta[]>([])
  const [splitId, setSplitId] = useState<string | null>(null)
  /** Bumped by "Start over" to remount both tools with a clean slate. */
  const [session, setSession] = useState(0)

  // ── Upload list ───────────────────────────────────────────────────────────
  const addFile = useCallback((meta: SourceMeta) => {
    sourceStore.retain(meta.id, 'library')
    setFiles((list) => [...list, meta])
  }, [])
  const upload = useIngest(addFile)
  // Files picked from inside the split tool join the list and become the split target.
  const addSplitFile = useCallback(
    (meta: SourceMeta) => {
      addFile(meta)
      setSplitId(meta.id)
    },
    [addFile],
  )
  const splitUpload = useIngest(addSplitFile)

  const removeFile = useCallback((id: string) => {
    setFiles((list) => list.filter((f) => f.id !== id))
    setSplitId((current) => (current === id ? null : current))
    sourceStore.release(id, 'library')
  }, [])

  // Thumbnails of freed files are revoked with them; everything goes on unmount.
  useEffect(() => sourceStore.onFree((id) => thumbnails.releaseSource(id)), [])
  useEffect(() => () => thumbnails.releaseAll(), [])

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((next: Screen) => {
    setScreen(next)
    window.history.pushState(null, '', urlFor(next))
    window.scrollTo({ top: 0 })
  }, [])
  useEffect(() => {
    const onPop = () => setScreen(screenFromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const startOver = useCallback(() => {
    if (files.length > 0 && !window.confirm('Remove all files and start over? Any unsaved work will be lost.')) return
    files.forEach((f) => sourceStore.release(f.id, 'library'))
    setFiles([])
    setSplitId(null)
    setSession((s) => s + 1)
    setScreen('home')
    window.history.replaceState(null, '', urlFor('home'))
  }, [files])

  // Nothing is saved anywhere, so warn before leaving with files loaded.
  useEffect(() => {
    if (files.length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [files.length])

  const splitTarget = files.find((f) => f.id === splitId) ?? null
  const tool = screen === 'home' ? null : TOOLS[screen]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => screen !== 'home' && navigate('home')}
            className="flex min-w-0 items-center gap-3 rounded-lg text-left"
            aria-label="PDF Stitch home"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Layers className="size-5" aria-hidden />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block text-lg font-bold leading-tight text-slate-900">PDF Stitch</span>
              <span className="block text-xs text-slate-500">Merge & split PDFs, privately, in your browser</span>
            </span>
          </button>
          <h1 className="sr-only">PDF Stitch{tool ? ` – ${tool.title}` : ''}</h1>

          {tool && (
            <div className="flex min-w-0 items-center gap-2 sm:ml-4 sm:border-l sm:border-slate-200 sm:pl-4">
              <button
                type="button"
                onClick={() => navigate('home')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <ArrowLeft className="size-4" aria-hidden /> Your files
              </button>
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-indigo-700">
                <tool.icon className="size-4 shrink-0" aria-hidden /> {tool.title}
              </span>
            </div>
          )}

          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 lg:inline-flex">
            <ShieldCheck className="size-3.5" aria-hidden /> 100% local · nothing is uploaded
          </span>
        </div>
      </header>

      <Home
        active={screen === 'home'}
        files={files}
        pending={upload.pending}
        onFiles={upload.ingest}
        onRemove={removeFile}
        onStartOver={startOver}
        onMerge={() => navigate('merge')}
        splitId={splitTarget?.id ?? files[0]?.id ?? null}
        onSplitIdChange={setSplitId}
        onSplit={() => {
          setSplitId(splitTarget?.id ?? files[0]?.id ?? null)
          navigate('split')
        }}
      />
      {/* Both tools stay mounted, so going back to the file list never loses work. */}
      <StitchView
        key={`merge-${session}`}
        active={screen === 'merge'}
        files={files}
        pending={upload.pending}
        onAddFiles={upload.ingest}
        onStartOver={startOver}
      />
      <SplitView
        key={`split-${session}`}
        active={screen === 'split'}
        file={splitTarget}
        pending={splitUpload.pending}
        onChooseFile={splitUpload.ingest}
        onRemoveFile={() => {
          if (splitTarget) removeFile(splitTarget.id)
        }}
      />
      <Toaster />
    </div>
  )
}
