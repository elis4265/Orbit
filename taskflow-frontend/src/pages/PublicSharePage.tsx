// REQ-163 — public read-only task view. No app chrome, no auth.
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { shareLinkApi } from '../api/client'
import RichContent from '../components/RichContent'

interface PublicTask {
  key: string
  title: string
  description: string | null
  status: string
  issue_type: string
  tags: { name: string; color: string }[]
  subtasks: { title: string; is_completed: boolean }[]
  comments: { content: string; created_at: string }[]
}

export default function PublicSharePage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, isError } = useQuery<PublicTask>({
    queryKey: ['public-share', token],
    queryFn: () => shareLinkApi.publicTask(token!),
    enabled: !!token,
    retry: false,
  })

  if (isLoading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Loading…</div>
  }
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">This link doesn't exist or has been revoked.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-xs text-gray-500 mb-1">{data.key} · shared read-only via Orbit</p>
        <h1 className="text-2xl font-semibold mb-2">{data.title}</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
            {data.status.replace('_', ' ')}
          </span>
          <span className="text-xs text-gray-500">{data.issue_type}</span>
          {data.tags.map((t) => (
            <span key={t.name} className="text-xs px-2 py-0.5 rounded-full border border-gray-700"
                  style={{ color: t.color }}>
              {t.name}
            </span>
          ))}
        </div>

        {data.description && (
          <RichContent html={data.description} className="prose prose-invert prose-sm max-w-none text-gray-300 mb-8" />
        )}

        {data.subtasks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-gray-400 mb-2">Subtasks</h2>
            <ul className="space-y-1">
              {data.subtasks.map((s, i) => (
                <li key={i} className={`text-sm ${s.is_completed ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                  {s.is_completed ? '☑' : '☐'} {s.title}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.comments.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Comments ({data.comments.length})</h2>
            <div className="space-y-3">
              {data.comments.map((c, i) => (
                <div key={i} className="border border-gray-800 rounded-xl p-3">
                  <RichContent html={c.content} className="prose prose-invert prose-sm max-w-none text-gray-300" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
