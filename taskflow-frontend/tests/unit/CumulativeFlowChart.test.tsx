import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CumulativeFlowChart from '../../src/components/CumulativeFlowChart'

const mockUseCFD = vi.fn()

vi.mock('../../src/hooks/useStats', () => ({
  useProjectCFD: (...args: unknown[]) => mockUseCFD(...args),
}))
vi.mock('../../src/components/InfoTooltip', () => ({
  default: ({ text }: { text: string }) => <span data-testid="info-tooltip" data-text={text} />,
}))
vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}))

const MOCK_DATA = [
  { date: '2026-06-01', todo: 5, in_progress: 2, done: 0 },
  { date: '2026-06-02', todo: 4, in_progress: 2, done: 1 },
]

describe('CumulativeFlowChart', () => {
  it('renders loading state', () => {
    mockUseCFD.mockReturnValue({ data: [], isLoading: true })
    render(<CumulativeFlowChart workspaceId="ws-1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders empty state when no data', () => {
    mockUseCFD.mockReturnValue({ data: [], isLoading: false })
    render(<CumulativeFlowChart workspaceId="ws-1" />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })

  it('renders area chart when data present', () => {
    mockUseCFD.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<CumulativeFlowChart workspaceId="ws-1" />)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('renders section title', () => {
    mockUseCFD.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<CumulativeFlowChart workspaceId="ws-1" />)
    expect(screen.getByText(/cumulative flow/i)).toBeInTheDocument()
  })

  it('renders info tooltip', () => {
    mockUseCFD.mockReturnValue({ data: MOCK_DATA, isLoading: false })
    render(<CumulativeFlowChart workspaceId="ws-1" />)
    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument()
  })

  it('passes board_id to hook when provided', () => {
    mockUseCFD.mockReturnValue({ data: [], isLoading: false })
    render(<CumulativeFlowChart workspaceId="ws-1" boardId="b-1" />)
    expect(mockUseCFD).toHaveBeenCalledWith('ws-1', expect.objectContaining({ board_id: 'b-1' }))
  })
})
