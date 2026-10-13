import { ArrowLeft, ClipboardList, Droplets, Hash, Layers, PenTool, Scissors, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Home, type SingleFileTool } from './components/Home'
import { SplitView } from './components/SplitView'
import { StitchView } from './components/StitchView'
import { Toaster } from './components/Toaster'
import { EditorTool } from './components/tools/EditorTool'
import { FormTool } from './components/tools/FormTool'
import { PageNumbersTool } from './components/tools/PageNumbersTool'
import { WatermarkTool } from './components/tools/WatermarkTool'
import { useToasts } from './hooks/useToasts'
import { useIngest } from './hooks/useIngest'
import { sourceStore } from './lib/sourceStore'
import { thumbnails } from './lib/thumbnails'
import type { SourceMeta } from './lib/types'

type Screen = 'home' | 'merge' | SingleFileTool

const TOOLS = {
  merge: { title: 'Merge PDFs', icon: Layers },
  split: { title: 'Split a PDF', icon: Scissors },
  edit: { title: 'Edit & sign', icon: PenTool },
  form: { title: 'Fill form', icon: ClipboardList },
  watermark: { title: 'Watermark', icon: Droplets },
  numbers: { title: 'Page numbers', icon: Hash },
} as const

const screenFromHash = (): Screen => {
  const h = window.location.hash.slice(1)
  return h in TOOLS ? (h as Screen) : 'home'
}
const urlFor = (screen: Screen) =>
  window.location.pathname + window.location.search + (screen === 'home' ? '' : `#${screen}`)

export default function App() {
  // Files live only in memory, so a reload always starts at the upload screen.
  const [screen, setScreen] = useState<Screen>(() => {
    if (window.location.hash) window.history.replaceState(null, '', urlFor('home'))
    return 'home'
  })
  const [files, setFiles] = useState<SourceMeta[]>([])
  /** The file the one-file tools (split, edit, form, …) work on. */
  const [toolFileId, setToolFileId] = useState<string | null>(null)
  const { push } = useToasts()
  /** Bumped by "Start over" to remount both tools with a clean slate. */
  const [session, setSession] = useState(0)

  // ── Upload list ───────────────────────────────────────────────────────────
  const addFile = useCallback((meta: SourceMeta) => {
    sourceStore.retain(meta.id, 'library')
    setFiles((list) => [...list, meta])
  }, [])
  const upload = useIngest(addFile)
  // Files picked from inside a one-file tool join the list and become its file.
  const addToolFile = useCallback(
    (meta: SourceMeta) => {
      addFile(meta)
      setToolFileId(meta.id)
    },
    [addFile],
  )
  const toolUpload = useIngest(addToolFile)
  // Results a tool hands back ("Add to files") join the list, ready to merge or edit further.
  const addResult = useCallback(
    (file: File) => {
      upload.ingest([file])
      push({ kind: 'success', title: 'Added to your files', description: `“${file.name}” is ready to merge or edit further.` })
    },
    [upload, push],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((list) => list.filter((f) => f.id !== id))
    setToolFileId((current) => (current === id ? null : current))
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
    setToolFileId(null)
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

  const toolFile = files.find((f) => f.id === toolFileId) ?? null
  const toolProps = {
    file: toolFile,
    pending: toolUpload.pending,
    onChooseFile: toolUpload.ingest,
    onRemoveFile: () => {
      if (toolFile) removeFile(toolFile.id)
    },
    onAddToFiles: addResult,
  }
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
        toolFileId={toolFile?.id ?? files[0]?.id ?? null}
        onToolFileChange={setToolFileId}
        onOpenTool={(tool) => {
          setToolFileId(toolFile?.id ?? files[0]?.id ?? null)
          navigate(tool)
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
        file={toolFile}
        pending={toolUpload.pending}
        onChooseFile={toolUpload.ingest}
        onRemoveFile={toolProps.onRemoveFile}
      />
      <EditorTool key={`edit-${session}`} active={screen === 'edit'} {...toolProps} />
      <FormTool key={`form-${session}`} active={screen === 'form'} {...toolProps} />
      <WatermarkTool key={`watermark-${session}`} active={screen === 'watermark'} {...toolProps} />
      <PageNumbersTool key={`numbers-${session}`} active={screen === 'numbers'} {...toolProps} />
      <Toaster />
    </div>
  )
}
