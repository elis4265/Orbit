import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DescriptionEditor from '../../src/components/DescriptionEditor'

vi.mock('../../src/lib/CodeBlockCodemirror', () => ({ CodeBlockCodemirror: {} }))

// ── Mock Yjs ────────────────────────────────────────────────────────────────
vi.mock('yjs', () => ({ Doc: vi.fn(() => ({})) }))

vi.mock('../../src/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'u1', first_name: 'Test', last_name: 'User', username: 'tuser', email: 't@t.com', initials: 'TU', avatar_url: null } }),
}))

// ── Mock HocuspocusProvider — captures event listeners so tests can fire them
const listeners = new Map<string, () => void>()
const mockAwareness = {
  clientID: 1,
  on: vi.fn(),
  off: vi.fn(),
  setLocalStateField: vi.fn(),
  getStates: vi.fn(() => new Map()),
}
const mockProvider = {
  on: vi.fn((event: string, handler: () => void) => { listeners.set(event, handler) }),
  off: vi.fn(),
  destroy: vi.fn(),
  awareness: mockAwareness,
}
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: vi.fn(() => mockProvider),
}))

// ── Mock Tiptap collaboration extensions ─────────────────────────────────────
vi.mock('@tiptap/extension-collaboration', () => ({ default: { configure: vi.fn(() => ({})) } }))
vi.mock('@tiptap/extension-collaboration-cursor', () => ({ default: { configure: vi.fn(() => ({})) } }))

// ── Mock Tiptap core ─────────────────────────────────────────────────────────
interface MockChain {
  toggleBold: () => MockChain
  toggleItalic: () => MockChain
  toggleCodeBlock: () => MockChain
  toggleBulletList: () => MockChain
  toggleOrderedList: () => MockChain
  focus: () => MockChain
  insertContent: () => MockChain
  run: () => void
}

interface MockEditor {
  chain: () => MockChain
  isActive: (name: string) => boolean
  commands: { focus: (pos?: string) => void }
}

const mockRun = vi.fn()
const makeChain = (): MockChain => {
  const chain: MockChain = {
    toggleBold: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleCodeBlock: vi.fn(() => chain),
    toggleBulletList: vi.fn(() => chain),
    toggleOrderedList: vi.fn(() => chain),
    focus: vi.fn(() => chain),
    insertContent: vi.fn(() => chain),
    run: mockRun,
  }
  return chain
}

let mockChain: MockChain
let mockEditor: MockEditor

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn((options: unknown) => {
    void options
    return mockEditor
  }),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content" data-has-editor={!!editor} />
  ),
}))

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: vi.fn(() => ({})) } }))
vi.mock('@tiptap/extension-image', () => ({ default: { configure: vi.fn(() => ({})) } }))

vi.mock('../../src/hooks/useAttachments', () => ({
  useUploadAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function renderEditor(taskId = 'task-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DescriptionEditor
        workspaceId="ws-1"
        boardId="board-1"
        taskId={taskId}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  listeners.clear()
  mockRun.mockReset()
  mockProvider.on.mockClear()
  mockProvider.off.mockClear()
  mockProvider.destroy.mockClear()
  mockChain = makeChain()
  mockEditor = {
    chain: vi.fn(() => mockChain),
    isActive: vi.fn(() => false),
    commands: { focus: vi.fn() },
  }
})

describe('DescriptionEditor — structure', () => {
  it('renders the editor content area', () => {
    renderEditor()
    expect(screen.getByTestId('editor-content')).toBeInTheDocument()
  })

  it('renders all toolbar buttons', () => {
    renderEditor()
    expect(screen.getByTitle('Bold')).toBeInTheDocument()
    expect(screen.getByTitle('Italic')).toBeInTheDocument()
    expect(screen.getByTitle('Code block')).toBeInTheDocument()
    expect(screen.getByTitle('Bullet list')).toBeInTheDocument()
    expect(screen.getByTitle('Ordered list')).toBeInTheDocument()
    expect(screen.getByTitle('Attach file')).toBeInTheDocument()
  })
})

describe('DescriptionEditor — sync status indicator (DD-026)', () => {
  it('shows "Connecting…" initially', () => {
    renderEditor()
    expect(screen.getByText(/Connecting/i)).toBeInTheDocument()
  })

  it('shows "Live" after provider fires connect', () => {
    renderEditor()
    act(() => { listeners.get('connect')?.() })
    expect(screen.getByText(/Live/i)).toBeInTheDocument()
  })

  it('shows "Offline" after provider fires disconnect', () => {
    renderEditor()
    act(() => { listeners.get('connect')?.() })
    act(() => { listeners.get('disconnect')?.() })
    expect(screen.getByText(/Offline/i)).toBeInTheDocument()
  })
})

describe('DescriptionEditor — toolbar actions', () => {
  it('Bold button calls toggleBold chain', () => {
    renderEditor()
    screen.getByTitle('Bold').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(mockChain.toggleBold).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })

  it('Italic button calls toggleItalic chain', () => {
    renderEditor()
    screen.getByTitle('Italic').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(mockChain.toggleItalic).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })

  it('Code block button calls toggleCodeBlock chain', () => {
    renderEditor()
    screen.getByTitle('Code block').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(mockChain.toggleCodeBlock).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })
})

describe('DescriptionEditor — Hocuspocus provider lifecycle', () => {
  it('registers connect and disconnect listeners on mount', () => {
    renderEditor()
    expect(mockProvider.on).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(mockProvider.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
  })

  it('destroys provider on unmount', () => {
    const { unmount } = renderEditor()
    unmount()
    expect(mockProvider.destroy).toHaveBeenCalled()
  })
})
