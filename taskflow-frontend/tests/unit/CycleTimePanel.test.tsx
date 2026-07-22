import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CycleTimePanel from '../../src/components/CycleTimePanel'

const mockUseCycleTime = vi.fn()

vi.mock('../../src/hooks/useStats', () => ({
  useCycleTime: (...args: unknown[]) => mockUseCycleTime(...args),
}))
vi.mock('../../src/components/InfoTooltip', () => ({
  default: () => <span data-testid="info-tooltip" />,
}))
vi.mock('recharts', () => ({
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}))

const MOCK_CYCLE = {
  lead_time:  { p50: 3.1, p85: 7.0, p95: 12.5, unit: 'days' },
  cycle_time: { p50: 1.5, p85: 4.2, p95: 9.0,  unit: 'days' },
  scatter: [
    { date: '2026-06-05', lead_days: 2.5, cycle_days: 1.2 },
    { date: '2026-06-10', lead_days: 5.0, cycle_days: null },
  ],
}

describe('CycleTimePanel', () => {
  it('renders loading state', () => {
    mockUseCycleTime.mockReturnValue({ data: undefined, isLoading: true })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders section title', () => {
    mockUseCycleTime.mockReturnValue({ data: MOCK_CYCLE, isLoading: false })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getAllByText(/cycle time/i).length).toBeGreaterThan(0)
  })

  it('renders lead time percentile cards', () => {
    mockUseCycleTime.mockReturnValue({ data: MOCK_CYCLE, isLoading: false })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getByText('Lead Time')).toBeInTheDocument()
    expect(screen.getByText('3.1d')).toBeInTheDocument()
    expect(screen.getByText('7d')).toBeInTheDocument()
    expect(screen.getByText('12.5d')).toBeInTheDocument()
  })

  it('renders cycle time percentile cards', () => {
    mockUseCycleTime.mockReturnValue({ data: MOCK_CYCLE, isLoading: false })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getByText('Cycle Time')).toBeInTheDocument()
    expect(screen.getByText('1.5d')).toBeInTheDocument()
  })

  it('shows "no completions" when lead_time is null', () => {
    mockUseCycleTime.mockReturnValue({
      data: { lead_time: null, cycle_time: null, scatter: [] },
      isLoading: false,
    })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getAllByText(/no completions in range/i).length).toBeGreaterThan(0)
  })

  it('renders scatter chart when scatter data present', () => {
    mockUseCycleTime.mockReturnValue({ data: MOCK_CYCLE, isLoading: false })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument()
  })

  it('hides scatter chart when no completions', () => {
    mockUseCycleTime.mockReturnValue({
      data: { lead_time: null, cycle_time: null, scatter: [] },
      isLoading: false,
    })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.queryByTestId('scatter-chart')).not.toBeInTheDocument()
  })

  it('renders info tooltip', () => {
    mockUseCycleTime.mockReturnValue({ data: MOCK_CYCLE, isLoading: false })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument()
  })

  it('P85 label shows SLA indicator', () => {
    mockUseCycleTime.mockReturnValue({ data: MOCK_CYCLE, isLoading: false })
    render(<CycleTimePanel workspaceId="ws-1" />)
    expect(screen.getAllByText(/P85.*SLA/i).length).toBeGreaterThan(0)
  })
})
