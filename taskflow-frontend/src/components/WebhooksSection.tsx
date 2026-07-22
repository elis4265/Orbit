import { useState } from 'react'
import { Trash2, Copy } from 'lucide-react'
import { useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook } from '../hooks/useWebhooks'
import type { WebhookEvent, WebhookFormat } from '../types'

// REQ-144 — outbound webhooks management (Project Settings → Integrations).
const ALL_EVENTS: { id: WebhookEvent; label: string }[] = [
  { id: 'task.created', label: 'Task created' },
  { id: 'task.updated', label: 'Task updated' },
  { id: 'task.completed', label: 'Task completed' },
  { id: 'task.deleted', label: 'Task deleted' },
  { id: 'comment.created', label: 'Comment added' },
  { id: 'sprint.closed', label: 'Sprint closed' },
]

export default function WebhooksSection({ projectId }: { projectId: string }) {
  const { data: webhooks = [] } = useWebhooks(projectId)
  const createWebhook = useCreateWebhook(projectId)
  const updateWebhook = useUpdateWebhook(projectId)
  const deleteWebhook = useDeleteWebhook(projectId)

  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<Set<WebhookEvent>>(new Set(['task.created', 'task.completed']))
  const [format, setFormat] = useState<WebhookFormat>('json')
  const [freshSecret, setFreshSecret] = useState<string | null>(null)

  function toggleEvent(id: WebhookEvent) {
    setEvents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!url.trim() || events.size === 0) return
    const created = await createWebhook.mutateAsync({ url: url.trim(), events: [...events], format })
    // Slack/Discord payloads are unsigned — the secret only matters for generic JSON (REQ-146).
    setFreshSecret(format === 'json' ? created.secret : null)
    setUrl('')
  }

  return (
    <div className="mt-6 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Outbound webhooks</p>
      <p className="text-xs text-gray-500 mb-3">
        POST signed JSON to your endpoint on project events. Payloads carry an{' '}
        <code className="text-gray-400">X-Orbit-Signature</code> HMAC-SHA256 header — verify it with the signing
        secret shown <strong className="text-gray-300">once</strong> at creation.
      </p>

      {freshSecret && (
        <div className="mb-3 p-3 bg-green-950/40 border border-green-800/50 rounded-xl">
          <p className="text-xs text-green-300 mb-2">Signing secret — copy it now, it will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-200 bg-gray-900 rounded-lg px-2 py-1.5 break-all">{freshSecret}</code>
            <button
              onClick={() => navigator.clipboard.writeText(freshSecret)}
              className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Copy secret"
            >
              <Copy size={13} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/orbit-hook"
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand placeholder-gray-600"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as WebhookFormat)}
            aria-label="Delivery format"
            className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
          >
            <option value="json">Signed JSON</option>
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {ALL_EVENTS.map((e) => (
            <label key={e.id} className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={events.has(e.id)}
                onChange={() => toggleEvent(e.id)}
                className="w-3.5 h-3.5 rounded accent-brand"
              />
              {e.label}
            </label>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!url.trim() || events.size === 0 || createWebhook.isPending}
          className="self-start px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
        >
          Add webhook
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
        {webhooks.length === 0 && <li className="px-4 py-3 text-sm text-gray-600">No webhooks configured.</li>}
        {webhooks.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{w.url}</p>
              <p className="text-xs text-gray-600 truncate">
                {w.events.join(', ')}
                {w.last_status != null && (
                  <span className={w.last_status < 300 ? 'text-green-500' : 'text-red-400'}>
                    {' '}· last delivery {w.last_status}
                  </span>
                )}
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={w.enabled}
                onChange={() => updateWebhook.mutate({ id: w.id, data: { enabled: !w.enabled } })}
                className="w-3.5 h-3.5 rounded accent-brand"
              />
              enabled
            </label>
            <button
              onClick={() => deleteWebhook.mutate(w.id)}
              className="text-gray-600 hover:text-red-400 transition-colors"
              aria-label={`Delete webhook ${w.url}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
