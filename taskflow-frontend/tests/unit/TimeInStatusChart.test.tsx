import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TimeInStatusChart from '../../src/components/TimeInStatusChart'

const mockUseTimeInStatus = vi.fn()

vi.mock('../../src/hooks/useStats', () => ({
  useTimeInStatus: (...args: unknown[]) => mockUseTimeInStatus(...args),
}))
vi.mock('../../src/components/InfoTooltip', () => ({
  default: () => <span data-testid="info-tooltip" />,
}))
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}))

const MOCK_DATA = [
  { status: 'todo',        avg_hours: 24.0, median_hours: 18.0, sample_count: 10 },
  { status: 'in_progress', avg_hours: 48.5, median_hours: 36.0, sample_count: 8  },
  { status: 'done',        avg_hours: 0.0,  median_hours: 0.0,  sample_count: 0  },
]

describe('TimeInStatusChart', () => {
  it('renders loading state', () => {
    mockUseTimeInStatus.mockReturnValue({ data: [], isLoading: true })
    render(<TimeInStatusChart workspaceId="ws-1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders empty state when no transitions', () => {
    mockUseTimeInStatus.mockReturnValue({ data: [], isLoading: false })
    render(<TimeInStatusChart workspaceId="ws-1" />)
    expect(screen.getByText(/not enough transition data/i)).toBeInTheDocument()
  })

  it('renders bar chart when data present', () => {
    mockUseTimeInStatus.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<TimeInStatusChart workspaceId="ws-1" />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders section title', () => {
    mockUseTimeInStatus.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<TimeInStatusChart workspaceId="ws-1" />)
    expect(screen.getByText(/time in status/i)).toBeInTheDocument()
  })

  it('renders info tooltip', () => {
    mockUseTimeInStatus.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<TimeInStatusChart workspaceId="ws-1" />)
    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument()
  })

  it('renders sample count footer', () => {
    mockUseTimeInStatus.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<TimeInStatusChart workspaceId="ws-1" />)
    expect(screen.getByText(/sample sizes/i)).toBeInTheDocument()
  })

  it('passes board_id to hook when provided', () => {
    mockUseTimeInStatus.mockReturnValue({ data: [], isLoading: false })
    render(<TimeInStatusChart workspaceId="ws-1" boardId="b-1" />)
    expect(mockUseTimeInStatus).toHaveBeenCalledWith('ws-1', { board_id: 'b-1' })
  })
})
