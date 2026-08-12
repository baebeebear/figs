import { useRef, useState } from 'react'
import { Camera, FileText, Link2 } from 'lucide-react'
import ModalSheet from './ModalSheet'
import { supabase } from '../services/supabase'
import { startRecipeImportJob } from '../lib/recipeIntake'

type Props = {
  userId: string
  onClose: () => void
  /** Placeholder inserted and worker kicked off — UI should close and watch the recipe id. */
  onImportStarted: (recipeId: string) => void
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function extractUrlFromPastedText(value: string): string {
  const match = value.match(/https?:\/\/[^\s]+/i)
  return (match?.[0] ?? value).trim()
}

export default function UploadRecipeModal({ userId, onClose, onImportStarted }: Props) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** Sync lock — React state alone can't stop Enter+click double-firing before re-render. */
  const inFlightRef = useRef(false)

  const submitLink = async () => {
    const cleanUrl = extractUrlFromPastedText(url)
    if (!cleanUrl) {
      setError('Paste a link first.')
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    setBusy(true)
    setError('')
    try {
      const { recipeId } = await startRecipeImportJob(userId, 'link', { url: cleanUrl })
      onImportStarted(recipeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start import.')
      setBusy(false)
      inFlightRef.current = false
    }
  }

  const submitPhotos = async (files: File[]) => {
    if (!files.length || !supabase) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    setBusy(true)
    setError('')
    try {
      const recipeId = crypto.randomUUID()
      const storagePaths: string[] = []
      const mimeTypes: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = (file.type || 'image/jpeg').includes('png') ? 'png' : 'jpg'
        const path = `${userId}/recipes/${recipeId}/intake-${i}.${ext}`
        const { error: upError } = await supabase.storage.from('post-images').upload(path, file, {
          upsert: true,
          contentType: file.type || 'image/jpeg',
        })
        if (upError) throw new Error(upError.message)
        storagePaths.push(path)
        mimeTypes.push(file.type || 'image/jpeg')
      }
      const { recipeId: finalId } = await startRecipeImportJob(userId, 'photos', {
        recipeId,
        storagePaths,
        mimeTypes,
        title: 'Importing from photos…',
      })
      onImportStarted(finalId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start photo import.')
      setBusy(false)
      inFlightRef.current = false
    }
  }

  const submitTextFile = async (file: File) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setBusy(true)
    setError('')
    try {
      const text = await readFileAsText(file)
      const { recipeId } = await startRecipeImportJob(userId, 'file', {
        textContent: text,
        title: file.name ? `Importing ${file.name}…` : 'Importing recipe…',
      })
      onImportStarted(recipeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start file import.')
      setBusy(false)
      inFlightRef.current = false
    }
  }

  return (
    <ModalSheet title="Upload recipe" subtitle="Paste a link, or add a photo or file." onClose={() => !busy && onClose()} maxWidthClassName="max-w-md">
      <div className="flex flex-col">
        <div className="flex h-12 items-center gap-2.5 rounded-[14px] border border-[#E8E8ED] bg-white px-4 transition-[border-color] focus-within:border-[#4C6A57]">
          <Link2 size={16} strokeWidth={2} className="shrink-0 text-[#9a9aa0]" />
          <input
            autoFocus
            className="min-w-0 flex-1 border-0 bg-transparent font-ui text-[14.5px] text-[#1A0D40] outline-none placeholder:text-[#9ca3af]"
            placeholder="Paste a recipe link…"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (pasted && /https?:\/\//i.test(pasted)) {
                e.preventDefault()
                setUrl(extractUrlFromPastedText(pasted))
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitLink()
            }}
          />
        </div>
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() => void submitLink()}
          className="mt-3 h-12 w-full rounded-[14px] border-0 bg-[#1A0D40] font-ui text-[14.5px] font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Starting…' : 'Import from link'}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#ECE9E3]" />
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9a9aa0]">or</span>
          <div className="h-px flex-1 bg-[#ECE9E3]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col items-center gap-2.5 rounded-[18px] border border-[#ECE9E3] bg-[#FAF9FC] px-4 py-6 transition hover:border-[#4C6A57]/30 hover:bg-[#4C6A57]/[0.05] active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4C6A57]/10 text-[#4C6A57]">
              <Camera size={19} strokeWidth={2} />
            </span>
            <span className="font-ui text-[13px] font-semibold text-[#1A0D40]">Photo</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2.5 rounded-[18px] border border-[#ECE9E3] bg-[#FAF9FC] px-4 py-6 transition hover:border-[#4C6A57]/30 hover:bg-[#4C6A57]/[0.05] active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4C6A57]/10 text-[#4C6A57]">
              <FileText size={19} strokeWidth={2} />
            </span>
            <span className="font-ui text-[13px] font-semibold text-[#1A0D40]">File</span>
          </button>
        </div>

        {error ? <p className="mt-3 font-ui text-[12px] font-medium text-[#c0503a]">{error}</p> : null}

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) void submitPhotos(files)
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void submitTextFile(file)
          }}
        />
      </div>
    </ModalSheet>
  )
}
