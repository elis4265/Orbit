import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Collaboration from '@tiptap/extension-collaboration'
import Mention from '@tiptap/extension-mention'
import { CodeBlockCodemirror } from '../lib/CodeBlockCodemirror'
import { buildMentionSuggestion } from '../lib/MentionSuggestion'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { Bold, Italic, Code2, List, ListOrdered, Paperclip, Wifi, WifiOff, Loader } from 'lucide-react'
import type { EditorView } from 'prosemirror-view'
import { useUploadAttachment } from '../hooks/useAttachments'
import { useMe } from '../hooks/useAuth'
import { useMembers } from '../hooks/useMembers'
const _proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
const HOCUSPOCUS_URL = `${_proto}://${window.location.host}/ws`

const AWARENESS_COLORS = ['#7c6af7', '#e879f9', '#22d3ee', '#4ade80', '#fb923c', '#f472b6', '#34d399', '#fbbf24']
function pickColor(id: string): string {
  const sum = Array.from(id).reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AWARENESS_COLORS[sum % AWARENESS_COLORS.length]
}

interface AwarenessUser { name: string; color: string; initials: string }

type SyncStatus = 'connecting' | 'connected' | 'offline'

interface Props {
  projectId: string
  taskId: string
  onHtmlChange?: (html: string) => void
}

export default function DescriptionEditor({ projectId, taskId, onHtmlChange }: Props) {
  const upload = useUploadAttachment(projectId, taskId)
  const uploadRef = useRef(upload)
  uploadRef.current = upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const suppressBlurRef = useRef(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting')
  const [peers, setPeers] = useState<AwarenessUser[]>([])
  const { data: me } = useMe()
  const { data: members = [] } = useMembers(projectId)
  const membersRef = useRef(members)
  membersRef.current = members

  // Y.Doc created once per mount in render body (safe — no side effects).
  // Provider is created in useEffect to avoid corrupting the Y.Doc when the
  // WebSocket is immediately refused (e.g. Hocuspocus down): the provider
  // constructor can call doc.destroy() on sync failure, which breaks the
  // Collaboration extension's createState and crashes ProseMirror (i.doc undefined).
  const ydocRef = useRef<Y.Doc | null>(null)
  if (!ydocRef.current) ydocRef.current = new Y.Doc()

  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    const ydoc = ydocRef.current!
    const provider = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: `task:${taskId}`,
      document: ydoc,
      token: localStorage.getItem('access_token') ?? '',
    })
    providerRef.current = provider
    const onConnect = () => setSyncStatus('connected')
    const onDisconnect = () => setSyncStatus('offline')
    provider.on('connect', onConnect)
    provider.on('disconnect', onDisconnect)

    const awareness = provider.awareness
    const onAwareness = () => {
      if (!awareness) return
      const myId = awareness.clientID
      const users: AwarenessUser[] = []
      awareness.getStates().forEach((state, id) => {
        if (id !== myId && state.user) users.push(state.user as AwarenessUser)
      })
      setPeers(users)
    }
    awareness?.on('change', onAwareness)

    return () => {
      awareness?.off('change', onAwareness)
      provider.off('connect', onConnect)
      provider.off('disconnect', onDisconnect)
      provider.destroy()
      providerRef.current = null
      ydocRef.current = null
      setPeers([])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onHtmlChangeRef = useRef(onHtmlChange)
  onHtmlChangeRef.current = onHtmlChange

  const editor = useEditor({
    onUpdate({ editor }) {
      onHtmlChangeRef.current?.(editor.getHTML())
    },
    extensions: [
      StarterKit.configure({ undoRedo: false, codeBlock: false }),
      Image.configure({ inline: true, allowBase64: true }),
      CodeBlockCodemirror,
      Collaboration.configure({ document: ydocRef.current! }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: buildMentionSuggestion(membersRef),
      }),
    ],
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[120px] text-sm text-gray-100 leading-relaxed prose prose-invert prose-sm max-w-none',
      },
      handlePaste(view: EditorView, event: ClipboardEvent) {
        const items: DataTransferItem[] = event.clipboardData ? Array.from(event.clipboardData.items) : []
        const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'))
        const fileItem = items.find((i) => i.kind === 'file' && !i.type.startsWith('image/'))

        if (imageItem) {
          const file = imageItem.getAsFile()
          if (!file) return false
          event.preventDefault()
          const reader = new FileReader()
          reader.onload = async (e) => {
            const src = e.target?.result as string
            view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })))
            try { await uploadRef.current.mutateAsync(file) } catch { /* best-effort */ }
          }
          reader.readAsDataURL(file)
          return true
        }

        if (fileItem) {
          const file = fileItem.getAsFile()
          if (!file) return false
          event.preventDefault()
          uploadRef.current.mutateAsync(file)
            .then(() => { view.dispatch(view.state.tr.insertText(`[${file.name}]`)) })
            .catch(() => { /* best-effort */ })
          return true
        }

        return false
      },
    },
  })

  useEffect(() => {
    if (!me || !providerRef.current?.awareness) return
    providerRef.current.awareness.setLocalStateField('user', {
      name: [me.first_name, me.last_name].filter(Boolean).join(' ') || me.username || me.email,
      color: pickColor(me.id),
      initials: me.initials ?? '',
    } satisfies AwarenessUser)
  }, [me])

  useEffect(() => {
    if (editor) setTimeout(() => editor.commands.focus('end'), 0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAttachFile(file: File) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const src = e.target?.result as string
        editor?.chain().insertContent({ type: 'image', attrs: { src } }).run()
        try { await uploadRef.current.mutateAsync(file) } catch { /* best-effort */ }
      }
      reader.readAsDataURL(file)
    } else {
      try {
        await uploadRef.current.mutateAsync(file)
        editor?.chain().insertContent(`[${file.name}]`).run()
      } catch { /* best-effort */ }
    }
  }

  if (!editor) return null

  return (
    <div className="rounded-lg border border-brand bg-gray-800 overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-700 flex-wrap">
        <ToolBtn onClick={() => editor.chain().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
          <Code2 size={13} />
        </ToolBtn>
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">
          <ListOrdered size={13} />
        </ToolBtn>
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <ToolBtn
          onClick={() => {
            suppressBlurRef.current = true
            let blocking = true
            const absorb = (evt: MouseEvent) => { if (blocking) evt.stopPropagation() }
            window.addEventListener('click', absorb, { capture: true })
            const onFocus = () => {
              suppressBlurRef.current = false
              setTimeout(() => {
                blocking = false
                window.removeEventListener('click', absorb, { capture: true })
              }, 150)
              window.removeEventListener('focus', onFocus)
            }
            window.addEventListener('focus', onFocus)
            fileInputRef.current?.click()
          }}
          active={false}
          title="Attach file"
        >
          <Paperclip size={13} />
        </ToolBtn>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            suppressBlurRef.current = false
            const file = e.target.files?.[0]
            if (file) { e.target.value = ''; handleAttachFile(file) }
          }}
        />
        <div className="flex-1" />
        <ActiveUsers users={peers} />
        <SyncIndicator status={syncStatus} />
      </div>

      <div className="px-3 py-2.5">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function ActiveUsers({ users }: { users: AwarenessUser[] }) {
  if (users.length === 0) return null
  const visible = users.slice(0, 4)
  const overflow = users.length - 4
  return (
    <div className="flex items-center -space-x-1.5 mr-1">
      {visible.map((u, i) => (
        <div
          key={i}
          title={u.name}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-gray-800"
          style={{ background: u.color }}
        >
          {u.initials || u.name[0]?.toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-gray-800 bg-gray-600">
          +{overflow}
        </div>
      )}
    </div>
  )
}

function SyncIndicator({ status }: { status: SyncStatus }) {
  if (status === 'connecting') return (
    <span className="flex items-center gap-1 text-[10px] text-gray-500 pr-1">
      <Loader size={10} className="animate-spin" /> Connecting…
    </span>
  )
  if (status === 'connected') return (
    <span className="flex items-center gap-1 text-[10px] text-green-600 pr-1">
      <Wifi size={10} /> Live
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[10px] text-red-500 pr-1">
      <WifiOff size={10} /> Offline
    </span>
  )
}

function ToolBtn({ onClick, active, title, children }: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-brand/30 text-brand' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
    >
      {children}
    </button>
  )
}
