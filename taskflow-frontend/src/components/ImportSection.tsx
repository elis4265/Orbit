import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { importApi } from '../api/client'

// REQ-149 — CSV task import. Columns: title (required), description, status, issue_type, due_date.
export default function ImportSection({ projectId }: { projectId: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null)
  const [failed, setFailed] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setFailed(false)
    setResult(null)
    try {
      const res = await importApi.csv(projectId, file)
      setResult(res)
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mt-6 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Import tasks (CSV)</p>
      <p className="text-xs text-gray-500 mb-3">
        Header row required. Columns: <code className="text-gray-400">title</code> (required),{' '}
        <code className="text-gray-400">description</code>, <code className="text-gray-400">status</code>{' '}
        (todo/in_progress/done), <code className="text-gray-400">issue_type</code> (task/bug/story/epic),{' '}
        <code className="text-gray-400">due_date</code> (ISO). Max 500 rows; bad rows are skipped and reported.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-label="CSV file"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
      >
        <Upload size={14} />
        {busy ? 'Importing…' : 'Choose CSV file'}
      </button>
      {failed && <p className="mt-2 text-xs text-red-400">Import failed — check the file is UTF-8 CSV with a title column.</p>}
      {result && (
        <div className="mt-3 text-xs">
          <p className="text-green-400">{result.created} task{result.created === 1 ? '' : 's'} imported.</p>
          {result.errors.length > 0 && (
            <ul className="mt-1 text-red-400">
              {result.errors.slice(0, 10).map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}
              {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
