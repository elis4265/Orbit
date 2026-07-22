// REQ-162 — reaction pills + curated picker
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommentReactions from '../../src/components/CommentReactions'
import type { Comment } from '../../src/types'

const mockReact = vi.fn().mockResolvedValue([])
const mockUnreact = vi.fn().mockResolvedValue([])
vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return {
    ...actual,
    commentApi: {
      ...actual.commentApi,
      react: (...args: unknown[]) => mockReact(...args),
      unreact: (...args: unknown[]) => mockUnreact(...args),
    },
  }
})

function makeComment(reactions: Comment['reactions']): Comment {
  return {
    id: 'c1', task_id: 't1', author_id: 'u1', content: '<p>x</p>',
    created_at: '', edited_at: null, reactions,
  }
}

function renderReactions(comment: Comment) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <CommentReactions projectId="p1" taskId="t1" comment={comment} />
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('REQ-162 — CommentReactions', () => {
  it('renders aggregate pills with counts', () => {
    renderReactions(makeComment([{ emoji: '🚀', count: 3, me: false }]))
    expect(screen.getByText('🚀')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('clicking a foreign pill reacts; clicking my pill unreacts', async () => {
    renderReactions(makeComment([
      { emoji: '🚀', count: 3, me: false },
      { emoji: '❤️', count: 1, me: true },
    ]))
    fireEvent.click(screen.getByRole('button', { name: /add 🚀 reaction/i }))
    await waitFor(() => expect(mockReact).toHaveBeenCalledWith('p1', 't1', 'c1', '🚀'))
    fireEvent.click(screen.getByRole('button', { name: /remove ❤️ reaction/i }))
    await waitFor(() => expect(mockUnreact).toHaveBeenCalledWith('p1', 't1', 'c1', '❤️'))
  })

  it('picker offers the curated set and reacts', async () => {
    renderReactions(makeComment([]))
    fireEvent.click(screen.getByRole('button', { name: /add reaction/i }))
    fireEvent.click(screen.getByRole('button', { name: /react with 🎉/i }))
    await waitFor(() => expect(mockReact).toHaveBeenCalledWith('p1', 't1', 'c1', '🎉'))
  })
})
