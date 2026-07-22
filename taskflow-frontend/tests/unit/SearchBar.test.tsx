import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import SearchBar from '../../src/components/SearchBar'

const BASE = 'http://localhost/api/v1'

const RESULTS = [
  { id: 'task-1', title: 'My router is not working', status: 'todo', board_id: 'board-1', project_id: 'proj-1', project_key: 'PR', sequence_number: 1 },
  { id: 'task-2', title: "My router didn't work", status: 'done', board_id: 'board-1', project_id: 'proj-1', project_key: 'PR', sequence_number: 2 },
]

const server = setupServer(
  http.get(`${BASE}/search/tasks`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? ''
    if (q.length < 2) return HttpResponse.json([])
    return HttpResponse.json(RESULTS.filter((r) => r.title.toLowerCase().includes(q.toLowerCase())))
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderBar(onSelectTask = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onSelectTask,
    ...render(
      <QueryClientProvider client={qc}>
        <SearchBar onSelectTask={onSelectTask} />
      </QueryClientProvider>
    ),
  }
}

describe('SearchBar', () => {
  it('renders input with placeholder', () => {
    renderBar()
    expect(screen.getByPlaceholderText('Search tasks…')).toBeInTheDocument()
  })

  it('does not fire search for single character', async () => {
    let called = false
    server.use(
      http.get(`${BASE}/search/tasks`, () => {
        called = true
        return HttpResponse.json([])
      })
    )
    renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'r' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(called).toBe(false)
  })

  it('shows results after typing 2+ characters', async () => {
    renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'router' } })
    await waitFor(() => expect(screen.getByText('My router is not working')).toBeInTheDocument(), { timeout: 1000 })
    expect(screen.getByText("My router didn't work")).toBeInTheDocument()
  })

  it('shows status badge on each result', async () => {
    renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'router' } })
    await waitFor(() => screen.getByText('My router is not working'))
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('calls onSelectTask with task id when result is clicked', async () => {
    const onSelectTask = vi.fn()
    renderBar(onSelectTask)
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'router' } })
    await waitFor(() => screen.getByText('My router is not working'))
    fireEvent.click(screen.getByText('My router is not working'))
    expect(onSelectTask).toHaveBeenCalledWith('proj-1', 'task-1')
  })

  it('clears input and closes dropdown on result click', async () => {
    renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'router' } })
    await waitFor(() => screen.getByText('My router is not working'))
    fireEvent.click(screen.getByText('My router is not working'))
    expect(screen.getByPlaceholderText('Search tasks…')).toHaveValue('')
    expect(screen.queryByText('My router is not working')).not.toBeInTheDocument()
  })

  it('shows no-results message when query matches nothing', async () => {
    renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'xyzzy' } })
    await waitFor(() => screen.getByText(/No results for/), { timeout: 1000 })
  })

  it('shows clear button when input has text and clears on click', async () => {
    renderBar()
    const input = screen.getByPlaceholderText('Search tasks…')
    fireEvent.change(input, { target: { value: 'router' } })
    const clearBtn = await waitFor(() => screen.getByLabelText('Clear search'))
    fireEvent.click(clearBtn)
    expect(input).toHaveValue('')
  })

  it('closes dropdown on Escape key', async () => {
    renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'router' } })
    await waitFor(() => screen.getByText('My router is not working'))
    fireEvent.keyDown(screen.getByPlaceholderText('Search tasks…'), { key: 'Escape' })
    expect(screen.queryByText('My router is not working')).not.toBeInTheDocument()
  })
})
