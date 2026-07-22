import { useRef, type RefObject } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import { CodeBlockCodemirror } from '../lib/CodeBlockCodemirror'
import { buildMentionSuggestion } from '../lib/MentionSuggestion'
import { useMembers } from '../hooks/useMembers'
import { Bold, Italic, Code2, List, ListOrdered, Paperclip } from 'lucide-react'
function buildHandlePaste(editorRef: RefObject<Editor | null>) {
  return function handlePaste(_view: unknown, event: ClipboardEvent): boolean {
    const items = event.clipboardData ? Array.from(event.clipboardData.items) : []
    const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (!file) return false
      event.preventDefault()
      const reader = new FileReader()
      reader.onload = (e) => {
        const src = e.target?.result as string
        editorRef.current?.chain().insertContent({ type: 'image', attrs: { src } }).run()
      }
      reader.readAsDataURL(file)
      return true
    }
    return false
  }
}

interface Props {
  workspaceId?: string
  initialContent?: string
  placeholder?: string
  onSave?: (html: string) => void
  onChange?: (html: string) => void  // controlled mode: no footer, fires on every change
  onCancel?: () => void
  saveLabel?: string
  minHeight?: string
  autoFocus?: boolean
  onAttach?: (file: File) => void
  canPostEmpty?: boolean
}

const DEFAULTS = {
  initialContent: '',
  placeholder: 'Write something…',
  saveLabel: 'Save',
  minHeight: '80px',
  autoFocus: true,
  canPostEmpty: false,
}

export default function LocalRichTextEditor(rawProps: Props) {
  const {
    workspaceId, initialContent, placeholder, onSave, onChange, onCancel,
    saveLabel, minHeight, autoFocus, onAttach, canPostEmpty,
  } = { ...DEFAULTS, ...rawProps }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)

  const { data: members = [] } = useMembers(workspaceId ?? '')
  const membersRef = useRef(members)
  membersRef.current = members

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image.configure({ inline: true, allowBase64: true }),
      CodeBlockCodemirror,
      ...(workspaceId ? [Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: buildMentionSuggestion(membersRef),
      })] : []),
    ],
    content: initialContent,
    autofocus: autoFocus ? 'end' : false,
    shouldRerenderOnTransaction: true,
    onUpdate: onChange ? (({ editor }) => onChange(editor.getHTML())) : undefined,
    editorProps: {
      attributes: {
        class: 'outline-none text-sm text-gray-100 leading-relaxed prose prose-invert prose-sm max-w-none',
        'data-placeholder': placeholder,
        style: `min-height: ${minHeight}`,
      },
      handlePaste: buildHandlePaste(editorRef),
    },
  })

  editorRef.current = editor

  if (!editor) return null

  function handleSave() {
    if (editor!.isEmpty && !canPostEmpty) return
    onSave?.(editor!.getHTML())
  }

  function handleContentKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onCancel?.()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { e.target.value = ''; onAttach!(file) }
  }

  function handleAttachClick() {
    let blocking = true
    const absorb = (evt: MouseEvent) => { if (blocking) evt.stopPropagation() }
    window.addEventListener('click', absorb, { capture: true })
    const onFocus = () => {
      setTimeout(() => {
        blocking = false
        window.removeEventListener('click', absorb, { capture: true })
      }, 150)
      window.removeEventListener('focus', onFocus)
    }
    window.addEventListener('focus', onFocus)
    fileInputRef.current?.click()
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden focus-within:border-brand transition-colors">
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
        {onAttach && (
          <>
            <div className="w-px h-4 bg-gray-700 mx-1" />
            <ToolBtn
              onClick={handleAttachClick}
              active={false}
              title="Attach file"
            >
              <Paperclip size={13} />
            </ToolBtn>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      <div
        className="px-3 py-2.5"
        onKeyDown={handleContentKeyDown}
      >
        <EditorContent editor={editor} />
      </div>

      {!onChange && (
        <div className="flex gap-2 px-3 pb-2.5 pt-1 border-t border-gray-700/50">
          <button
            type="button"
            onClick={handleSave}
            disabled={editor.isEmpty && !canPostEmpty}
            className="text-xs px-2.5 py-1 bg-brand rounded-lg text-white hover:bg-brand/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saveLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs px-2.5 py-1 text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
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
