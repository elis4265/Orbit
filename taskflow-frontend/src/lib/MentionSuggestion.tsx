import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { ProjectMember } from '../types'

interface MentionListProps {
  items: ProjectMember[]
  command: (item: { id: string; label: string }) => void
}

interface MentionListRef {
  onKeyDown: (e: KeyboardEvent) => boolean
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => setSelectedIndex(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp') {
        setSelectedIndex(i => (i + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (e.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (e.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  function selectItem(index: number) {
    const member = items[index]
    if (!member) return
    const handle = member.username ?? member.email
    command({ id: handle, label: handle })
  }

  if (!items.length) return null

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden min-w-[180px] max-h-48 overflow-y-auto">
      {items.map((member, i) => (
        <button
          key={member.id}
          onPointerDown={(e) => { e.preventDefault(); selectItem(i) }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex ? 'bg-brand/20 text-white' : 'text-gray-300 hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0 w-6 h-6 rounded-full bg-brand/30 flex items-center justify-center text-[11px] font-semibold text-brand">
            {member.initials}
          </span>
          <span className="truncate">
            {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.username || member.email}
          </span>
          {member.username && (
            <span className="text-gray-500 text-xs ml-auto shrink-0">@{member.username}</span>
          )}
        </button>
      ))}
    </div>
  )
})

MentionList.displayName = 'MentionList'

export function buildMentionSuggestion(
  membersRef: React.RefObject<ProjectMember[]>,
): Partial<SuggestionOptions<ProjectMember>> {
  return {
    items({ query }: { query: string }) {
      const q = query.toLowerCase()
      return (membersRef.current ?? [])
        .filter(m =>
          (m.username ?? '').toLowerCase().includes(q) ||
          (m.first_name ?? '').toLowerCase().includes(q) ||
          (m.last_name ?? '').toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
        )
        .slice(0, 8)
    },

    render() {
      let renderer: ReactRenderer<MentionListRef> | null = null
      let container: HTMLDivElement | null = null

      function position(props: SuggestionProps<ProjectMember>) {
        const rect = props.clientRect?.()
        if (rect && container) {
          container.style.top = `${rect.bottom + 4}px`
          container.style.left = `${rect.left}px`
        }
      }

      return {
        onStart(props: SuggestionProps<ProjectMember>) {
          container = document.createElement('div')
          container.style.cssText = 'position:fixed;z-index:9999;pointer-events:auto;'
          document.body.appendChild(container)
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor })
          container.appendChild(renderer.element)
          position(props)
        },

        onUpdate(props: SuggestionProps<ProjectMember>) {
          renderer?.updateProps(props)
          position(props)
        },

        onKeyDown(props: SuggestionKeyDownProps) {
          return renderer?.ref?.onKeyDown(props.event) ?? false
        },

        onExit() {
          renderer?.destroy()
          container?.remove()
          renderer = null
          container = null
        },
      }
    },
  }
}
