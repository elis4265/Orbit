import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatsPanel from '../../src/components/StatsPanel'

// Mock child chart components so we test StatsPanel logic in isolation
vi.mock('../../src/components/CumulativeFlowChart', () => ({
  default: () => <div data-testid="cfd-chart" />,
}))
vi.mock('../../src/components/TimeInStatusChart', () => ({
  default: () => <div data-testid="time-in-status-chart" />,
}))
vi.mock('../../src/components/CycleTimePanel', () => ({
  default: () => <div data-testid="cycle-time-panel" />,
}))
vi.mock('../../src/components/InfoTooltip', () => ({
  default: ({ text }: { text: string }) => <span data-testid="info-tooltip" data-text={text} />,
}))

const mockUseProjectStats = vi.fn()

vi.mock('../../src/hooks/useStats', () => ({
  useProjectStats: (...args: unknown[]) => mockUseProjectStats(...args),
  useProjectBurndown: () => ({ data: [], isLoading: false }),
  useProjectCFD: () => ({ data: [], isLoading: false }),
  useTimeInStatus: () => ({ data: [], isLoading: false }),
  useCycleTime: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => null,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
}))

const MOCK_STATS = {
  by_status: [
    { status: 'todo', count: 10 },
    { status: 'in_progress', count: 5 },
    { status: 'done', count: 20 },
  ],
  by_priority: [
    { priority: 1, count: 3 },
    { priority: 3, count: 8 },
  ],
  by_assignee: [
    { user_id: 'u-1', name: 'Alice', count: 7 },
    { user_id: 'u-2', name: 'Bob', count: 3 },
  ],
  throughput: [
    { date: '2026-06-01', created: 2, completed: 1 },
    { date: '2026-06-02', created: 1, completed: 3 },
  ],
  completion_rate: 40.0,
  completed_count: 20,
  created_count: 50,
  overdue_count: 3,
  by_age: [
    { label: '<7d',    count: 5,  max_days: 7 },
    { label: '7-14d',  count: 2,  max_days: 14 },
    { label: '14-30d', count: 0,  max_days: 30 },
    { label: '30-60d', count: 1,  max_days: 60 },
    { label: '60+d',   count: 0,  max_days: 999999 },
  ],
}

describe('StatsPanel', () => {
  it('renders loading state when stats are loading', () => {
    mockUseProjectStats.mockReturnValue({ data: undefined, isLoading: true })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders summary pills with stats data', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('renders summary pill labels', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText('Created in range')).toBeInTheDocument()
    expect(screen.getByText('Completed in range')).toBeInTheDocument()
    expect(screen.getByText('Completion rate')).toBeInTheDocument()
  })

  it('renders date range pill buttons', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByRole('button', { name: /last 7d/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /last 30d/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /last 90d/i })).toBeInTheDocument()
  })

  it('renders section headings', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText('By Status')).toBeInTheDocument()
    expect(screen.getByText('By Priority')).toBeInTheDocument()
    expect(screen.getByText(/throughput/i)).toBeInTheDocument()
  })

  it('renders assignee section when data present', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText(/open tasks by assignee/i)).toBeInTheDocument()
  })

  it('clicking range button updates selection visually', async () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    const btn7 = screen.getByRole('button', { name: /last 7d/i })
    await userEvent.click(btn7)
    expect(btn7.className).toContain('bg-brand')
  })

  it('renders board selector when boards are passed', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    const boards = [
      { id: 'b-1', name: 'Board A', workspace_id: 'ws-1', created_at: '' },
      { id: 'b-2', name: 'Board B', workspace_id: 'ws-1', created_at: '' },
    ]
    render(<StatsPanel workspaceId="ws-1" boards={boards} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Board A' })).toBeInTheDocument()
  })

  it('shows "No data" when by_status is empty', () => {
    mockUseProjectStats.mockReturnValue({
      data: { ...MOCK_STATS, by_status: [] },
      isLoading: false,
    })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(1)
  })

  // ── Overdue card ──────────────────────────────────────────────────────────

  it('renders overdue count', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('overdue card has warning style when overdue > 0', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    const { container } = render(<StatsPanel workspaceId="ws-1" />)
    expect(container.querySelector('.bg-red-950\\/40')).toBeInTheDocument()
  })

  it('overdue card has neutral style when overdue is 0', () => {
    mockUseProjectStats.mockReturnValue({
      data: { ...MOCK_STATS, overdue_count: 0 },
      isLoading: false,
    })
    const { container } = render(<StatsPanel workspaceId="ws-1" />)
    expect(container.querySelector('.bg-red-950\\/40')).not.toBeInTheDocument()
  })

  // ── Age distribution ──────────────────────────────────────────────────────

  it('renders age distribution section when data present', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByText(/issue age distribution/i)).toBeInTheDocument()
  })

  it('hides age distribution when all buckets are zero', () => {
    const emptyAge = MOCK_STATS.by_age.map(b => ({ ...b, count: 0 }))
    mockUseProjectStats.mockReturnValue({
      data: { ...MOCK_STATS, by_age: emptyAge },
      isLoading: false,
    })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.queryByText(/issue age distribution/i)).not.toBeInTheDocument()
  })

  // ── Sub-components rendered ───────────────────────────────────────────────

  it('renders CumulativeFlowChart', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByTestId('cfd-chart')).toBeInTheDocument()
  })

  it('renders TimeInStatusChart', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByTestId('time-in-status-chart')).toBeInTheDocument()
  })

  it('renders CycleTimePanel', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    expect(screen.getByTestId('cycle-time-panel')).toBeInTheDocument()
  })

  // ── InfoTooltips present ──────────────────────────────────────────────────

  it('renders InfoTooltip on each chart section', () => {
    mockUseProjectStats.mockReturnValue({ data: MOCK_STATS, isLoading: false })
    render(<StatsPanel workspaceId="ws-1" />)
    const tooltips = screen.getAllByTestId('info-tooltip')
    // overdue + by_status + by_priority + throughput + assignee + age = 6 minimum
    expect(tooltips.length).toBeGreaterThanOrEqual(6)
  })
})
