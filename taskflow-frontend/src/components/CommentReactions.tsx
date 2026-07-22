// REQ-162 — emoji reaction pills + picker on a comment.
// Teams model: curated defaults + project custom emotes; a custom emote named
// like a default replaces it in the picker. Customs are stored as ':name:'.
// Emote management (upload / replace / delete) lives in Preferences → Emotes.
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SmilePlus } from 'lucide-react'
import { commentApi } from '../api/client'
import { useEmotes } from '../hooks/useEmotes'
import type { Comment, CustomEmote } from '../types'

// Mirror of the backend curated set + canonical names (models/comment_reaction.py)
export const REACTION_EMOJIS = ['👍', '👎', '❤️', '🎉', '👀', '🚀', '😄', '🤔']
export const DEFAULT_EMOTE_NAMES: Record<string, string> = {
  thumbsup: '👍', thumbsdown: '👎', heart: '❤️', tada: '🎉',
  eyes: '👀', rocket: '🚀', smile: '😄', thinking: '🤔',
}

interface Props {
  projectId: string
  taskId: string
  comment: Comment
}

/** ':name:' → name, or null when the string is a plain unicode emoji. */
function customName(emoji: string): string | null {
  return emoji.startsWith(':') && emoji.endsWith(':') ? emoji.slice(1, -1) : null
}

function EmoteImg({ emote, size = 16 }: { emote: CustomEmote; size?: number }) {
  return <img src={emote.url} alt={`:${emote.name}:`} title={`:${emote.name}:`} width={size} height={size} className="inline-block object-contain" />
}

export default function CommentReactions({ projectId, taskId, comment }: Props) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: emotes = [] } = useEmotes(projectId)
  const emotesByName = new Map(emotes.map((e) => [e.name, e]))

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const toggle = useMutation({
    mutationFn: ({ emoji, mine }: { emoji: string; mine: boolean }) =>
      mine
        ? commentApi.unreact(projectId, taskId, comment.id, emoji)
        : commentApi.react(projectId, taskId, comment.id, emoji),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', projectId, comment.task_id] })
      qc.invalidateQueries({ queryKey: ['comments'] })
    },
  })

  const reactions = comment.reactions ?? []

  // Picker entries: defaults not shadowed by a same-named custom, then all customs.
  const defaultEntries = Object.entries(DEFAULT_EMOTE_NAMES)
    .filter(([name]) => !emotesByName.has(name))
    .map(([, emoji]) => ({ key: emoji, emoji, emote: undefined as CustomEmote | undefined }))
  const customEntries = emotes.map((e) => ({ key: `:${e.name}:`, emoji: `:${e.name}:`, emote: e }))
  const pickerEntries = [...defaultEntries, ...customEntries]

  return (
    <div ref={ref} className="flex items-center gap-1.5 flex-wrap mt-2">
      {reactions.map((r) => {
        const name = customName(r.emoji)
        const emote = name ? emotesByName.get(name) : undefined
        return (
          <button
            key={r.emoji}
            type="button"
            aria-label={`${r.me ? 'Remove' : 'Add'} ${r.emoji} reaction`}
            onClick={() => toggle.mutate({ emoji: r.emoji, mine: r.me })}
            disabled={toggle.isPending}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
              r.me
                ? 'border-brand/60 bg-brand/15 text-gray-100'
                : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
            }`}
          >
            {emote ? <EmoteImg emote={emote} /> : <span>{name ? `:${name}:` : r.emoji}</span>}
            <span className="text-gray-400">{r.count}</span>
          </button>
        )
      })}

      <div className="relative">
        <button
          type="button"
          aria-label="Add reaction"
          title="Add reaction"
          onClick={() => setPickerOpen((v) => !v)}
          className="text-gray-600 hover:text-gray-300 transition-colors p-0.5"
        >
          <SmilePlus size={14} />
        </button>
        {pickerOpen && (
          <div className="absolute left-0 bottom-full mb-1 z-50 flex gap-1 flex-wrap w-max max-w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-xl px-2 py-1.5">
            {pickerEntries.map(({ key, emoji, emote }) => {
              const mine = reactions.find((r) => r.emoji === emoji)?.me ?? false
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`React with ${key}`}
                  onClick={() => { toggle.mutate({ emoji, mine }); setPickerOpen(false) }}
                  className={`text-base hover:scale-125 transition-transform p-0.5 ${mine ? 'opacity-50' : ''}`}
                >
                  {emote ? <EmoteImg emote={emote} size={18} /> : emoji}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
