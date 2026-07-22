import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import SmartFilterBar, { type ActiveFilter, type FilterFieldDef } from '../../src/components/SmartFilterBar'

const FIELDS: FilterFieldDef[] = [
  {
    id: 'assignee',
    label: 'Assignee',
    options: [
      { value: 'u-1', label: 'alice' },
      { value: 'u-2', label: 'bob' },
    ],
  },
  {
    id: 'tag',
    label: 'Tag',
    options: [
      { value: 't-1', label: 'kurva', color: '#ff6b6b' },
      { value: 't-2', label: 'backend', color: '#4ecdc4' },
    ],
  },
  {
    id: 'status',
    label: 'Status',
    options: [
      { value: 'todo', label: 'To Do' },
      { value: 'in_progress', label: 'In Progress' },
    ],
  },
]

function makeFilter(overrides: Partial<ActiveFilter> = {}): ActiveFilter {
  return {
    instanceId: 'x',
    fieldId: 'assignee',
    fieldLabel: 'Assignee',
    value: 'u-1',
    label: 'alice',
    negate: false,
    ...overrides,
  }
}

function renderBar(filters: ActiveFilter[] = [], onChange = vi.fn()) {
  return { onChange, ...render(
    <SmartFilterBar filters={filters} onFiltersChange={onChange} fields={FIELDS} />
  )}
}

function getInput() {
  return screen.getByRole('combobox')
}

describe('SmartFilterBar — initial state', () => {
  it('renders placeholder when no filters', () => {
    renderBar()
    expect(screen.getByPlaceholderText(/type @ to filter/i)).toBeInTheDocument()
  })

  it('hides placeholder when filters are active', () => {
    renderBar([makeFilter()])
    expect(screen.queryByPlaceholderText(/type @ to filter/i)).not.toBeInTheDocument()
  })

  it('renders active filter pills', () => {
    renderBar([makeFilter()])
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('Assignee:')).toBeInTheDocument()
  })

  it('renders clear-all button when filters exist', () => {
    renderBar([makeFilter()])
    expect(screen.getByLabelText('Clear all filters')).toBeInTheDocument()
  })
})

describe('SmartFilterBar — field dropdown', () => {
  it('opens field dropdown on @ input', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    expect(screen.getByText('Filter by')).toBeInTheDocument()
    expect(screen.getByText('@assignee')).toBeInTheDocument()
    expect(screen.getByText('@tag')).toBeInTheDocument()
    expect(screen.getByText('@status')).toBeInTheDocument()
  })

  it('filters field options by typed text', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@as' } })
    expect(screen.getByText('@assignee')).toBeInTheDocument()
    expect(screen.queryByText('@tag')).not.toBeInTheDocument()
  })

  it('shows no-match message when field search has no results', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@zzz' } })
    expect(screen.getByText('No fields match')).toBeInTheDocument()
  })

  it('shows NOT label in dropdown header when -@ prefix used', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '-@' } })
    expect(screen.getByText(/NOT.*Filter by/i)).toBeInTheDocument()
  })

  it('shows -@field in dropdown item when -@ prefix used', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '-@' } })
    expect(screen.getByText('-@assignee')).toBeInTheDocument()
  })
})

describe('SmartFilterBar — value dropdown', () => {
  it('opens value dropdown after selecting a field', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    fireEvent.click(screen.getByText('@assignee'))
    expect(screen.getByText('Assignee')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('opens value dropdown from typed @field: pattern', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@tag:' } })
    expect(screen.getByText('kurva')).toBeInTheDocument()
    expect(screen.getByText('backend')).toBeInTheDocument()
  })

  it('filters value options by search text', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@tag:kur' } })
    expect(screen.getByText('kurva')).toBeInTheDocument()
    expect(screen.queryByText('backend')).not.toBeInTheDocument()
  })

  it('shows no-match message when value search has no results', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@assignee:zzz' } })
    expect(screen.getByText('No options match')).toBeInTheDocument()
  })
})

describe('SmartFilterBar — selecting a value', () => {
  it('calls onFiltersChange with new filter when value is selected', () => {
    const { onChange } = renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    fireEvent.click(screen.getByText('@assignee'))
    fireEvent.click(screen.getByText('alice'))
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'assignee',
          fieldLabel: 'Assignee',
          value: 'u-1',
          label: 'alice',
          negate: false,
        }),
      ])
    )
  })

  it('keeps dropdown open after selecting a value (OR accumulation)', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    fireEvent.click(screen.getByText('@assignee'))
    fireEvent.click(screen.getByText('alice'))
    // Dropdown should still be visible for OR selection
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('shows checkmark on already-applied values', () => {
    renderBar([makeFilter({ fieldId: 'tag', fieldLabel: 'Tag', value: 't-1', label: 'kurva', color: '#ff6b6b' })])
    fireEvent.change(getInput(), { target: { value: '@tag:' } })
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('does not add duplicate filter when same value selected again', () => {
    const { onChange } = renderBar([makeFilter()])
    fireEvent.change(getInput(), { target: { value: '@' } })
    fireEvent.click(screen.getByText('@assignee'))
    // alice appears in both the pill and the dropdown — target the dropdown option
    const aliceOption = screen.getAllByRole('option').find(el => el.textContent?.includes('alice'))!
    fireEvent.click(aliceOption)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SmartFilterBar — OR within field', () => {
  it('can add two values for the same field (OR)', () => {
    // Needs a stateful wrapper so filters prop updates between clicks
    const onChange = vi.fn()
    function Wrapper() {
      const [filters, setFilters] = useState<ActiveFilter[]>([])
      return (
        <SmartFilterBar
          filters={filters}
          onFiltersChange={(f) => { setFilters(f); onChange(f) }}
          fields={FIELDS}
        />
      )
    }
    render(<Wrapper />)

    fireEvent.change(getInput(), { target: { value: '@' } })
    fireEvent.click(screen.getByText('@assignee'))
    fireEvent.click(screen.getByText('alice'))
    // Dropdown stays open for OR — bob should still be there
    fireEvent.click(screen.getByText('bob'))

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as ActiveFilter[]
    const values = lastCall.filter(f => f.fieldId === 'assignee').map(f => f.value)
    expect(values).toContain('u-1') // alice
    expect(values).toContain('u-2') // bob
  })
})

describe('SmartFilterBar — negation', () => {
  it('creates a negated filter when -@ prefix is used', () => {
    const { onChange } = renderBar()
    fireEvent.change(getInput(), { target: { value: '-@' } })
    fireEvent.click(screen.getByText('-@assignee'))
    fireEvent.click(screen.getByText('alice'))
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: 'assignee', value: 'u-1', negate: true }),
      ])
    )
  })

  it('shows NOT badge on negated pill', () => {
    renderBar([makeFilter({ negate: true })])
    expect(screen.getByText('NOT')).toBeInTheDocument()
  })

  it('does not show NOT badge on positive pill', () => {
    renderBar([makeFilter({ negate: false })])
    expect(screen.queryByText('NOT')).not.toBeInTheDocument()
  })

  it('toggles filter to negated when ≠ button is clicked on positive pill', () => {
    const { onChange } = renderBar([makeFilter({ negate: false })])
    fireEvent.click(screen.getByLabelText('Negate Assignee: alice'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ negate: true }),
    ])
  })

  it('toggles filter back to positive when ≠ button is clicked on negated pill', () => {
    const { onChange } = renderBar([makeFilter({ negate: true })])
    fireEvent.click(screen.getByLabelText('Remove NOT from Assignee: alice'))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ negate: false }),
    ])
  })
})

describe('SmartFilterBar — removing filters', () => {
  it('calls onFiltersChange without the removed filter on × click', () => {
    const filter = makeFilter()
    const { onChange } = renderBar([filter])
    fireEvent.click(screen.getByLabelText('Remove Assignee: alice'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('calls onFiltersChange with empty array on clear-all click', () => {
    const { onChange } = renderBar([makeFilter()])
    fireEvent.click(screen.getByLabelText('Clear all filters'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('removes last filter on Backspace in empty input', () => {
    const { onChange } = renderBar([makeFilter()])
    fireEvent.keyDown(getInput(), { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('SmartFilterBar — keyboard navigation', () => {
  it('closes dropdown on Escape', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    expect(screen.getByText('Filter by')).toBeInTheDocument()
    fireEvent.keyDown(getInput(), { key: 'Escape' })
    expect(screen.queryByText('Filter by')).not.toBeInTheDocument()
  })

  it('selects highlighted field on Enter', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    // First option (assignee) is highlighted by default
    fireEvent.keyDown(getInput(), { key: 'Enter' })
    // Should switch to value mode for 'assignee'
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('moves highlight down with ArrowDown', () => {
    renderBar()
    fireEvent.change(getInput(), { target: { value: '@' } })
    fireEvent.keyDown(getInput(), { key: 'ArrowDown' })
    // Second option should now be highlighted (tag)
    const tagOption = screen.getByText('@tag').closest('button')
    expect(tagOption).toHaveAttribute('aria-selected', 'true')
  })
})
