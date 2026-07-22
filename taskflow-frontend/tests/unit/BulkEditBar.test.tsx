// REQ-157 — selection bar + command dialog
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import BulkEditBar from '../../src/components/BulkEditBar'
import type { BulkCommandContext } from '../../src/lib/bulkCommand'
import { server } from '../setup/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const BASE = 'http://localhost/api/v1'

const ctx: BulkCommandContext = {
  meId: 'me-1',
  mode: 'open',
  members: [{ id: 'me-1', username: 'anon', email: 'anon@x.io' }],
  statuses: [],
  sprints: [],
  priorities: [],
  tags: [{ id: 'tag-1', name: 'backend' }],
}

function renderBar(selected = ['t1', 't2'], onApplied = vi.fn(), onClear = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <BulkEditBar projectId="p1" selectedIds={selected} context={ctx} onClear={onClear} onApplied={onApplied} />
    </QueryClientProvider>
  )
  return { onApplied, onClear }
}

describe('REQ-157 — BulkEditBar', () => {
  it('shows selection count and opens the command dialog', () => {
    renderBar()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /command/i }))
    expect(screen.getByPlaceholderText(/@status:done/)).toBeInTheDocument()
  })

  it('previews a valid command and applies it', async () => {
    let sent: unknown = null
    server.use(
      http.patch(`${BASE}/projects/p1/tasks/bulk`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ updated: ['t1', 't2'], errors: [] })
      })
    )
    const { onApplied } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /command/i }))
    fireEvent.change(screen.getByPlaceholderText(/@status:done/), {
      target: { value: '@status:done @tag:+backend' },
    })
    expect(screen.getByText(/Set status → done/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() => expect(sent).toEqual({
      task_ids: ['t1', 't2'],
      changes: { status: 'done', add_tag_ids: ['tag-1'] },
    }))
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(['t1', 't2']))
  })

  it('bad command shows parse error and disables Apply', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /command/i }))
    fireEvent.change(screen.getByPlaceholderText(/@status:done/), {
      target: { value: '@assignee:ghost' },
    })
    expect(screen.getByText(/unknown assignee/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeDisabled()
  })

  it('partial failure keeps dialog open with a summary', async () => {
    server.use(
      http.patch(`${BASE}/projects/p1/tasks/bulk`, () =>
        HttpResponse.json({
          updated: ['t1'],
          errors: [{ task_id: 't2', error: 'Transition not allowed.' }],
        })
      )
    )
    const { onApplied } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /command/i }))
    fireEvent.change(screen.getByPlaceholderText(/@status:done/), {
      target: { value: '@status:done' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    expect((await screen.findAllByText(/1 updated · 1 blocked/i)).length).toBeGreaterThan(0)
    expect(onApplied).toHaveBeenCalledWith(['t1'])
    expect(screen.getByPlaceholderText(/@status:done/)).toBeInTheDocument() // still open for retry
  })

  it('Escape clears selection when dialog closed', () => {
    const { onClear } = renderBar()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClear).toHaveBeenCalled()
  })
})
