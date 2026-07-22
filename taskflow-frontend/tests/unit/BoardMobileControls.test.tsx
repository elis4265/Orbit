// Mobile board toolbar: below md the secondary controls collapse behind a single
// "View" button that opens a bottom sheet. The trigger and the sheet are both
// CSS-hidden from md up, so the desktop toolbar row is untouched.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BoardMobileControls from '../../src/components/BoardMobileControls'
import type { SavedSearch } from '../../src/types'

const SAVED: SavedSearch[] = [
  { id: 's1', project_id: 'p1', user_id: 'u1', name: 'My bugs', filters: [], created_at: '', updated_at: '' },
]

type Props = Parameters<typeof BoardMobileControls>[0]

function setup(overrides: Partial<Props> = {}) {
  const onOpenChange = vi.fn()
  const props: Props = {
    open: false,
    onOpenChange,
    showKanbanControls: true,
    swimlaneMode: 'none',
    onSwimlaneChange: vi.fn(),
    compact: false,
    onToggleCompact: vi.fn(),
    gridMode: false,
    onToggleGrid: vi.fn(),
    showSprintPanelToggle: true,
    sprintPanelOpen: false,
    onToggleSprintPanel: vi.fn(),
    showSprintScope: true,
    sprintScope: 'active',
    onSprintScopeChange: vi.fn(),
    activeSprintName: 'Sprint 7',
    savedSearches: SAVED,
    onApplySavedSearch: vi.fn(),
    onDeleteSavedSearch: vi.fn(),
    canSaveSearch: false,
    saveSearchName: '',
    onSaveSearchNameChange: vi.fn(),
    onSaveSearch: vi.fn(),
    savingSearch: false,
    ...overrides,
  }
  const utils = render(<BoardMobileControls {...props} />)
  return { ...utils, props }
}

const trigger = () => screen.getByRole('button', { name: 'Board view options' })
const sheet = () => document.getElementById('board-mobile-controls') as HTMLElement

describe('Board mobile controls sheet', () => {
  it('is mobile-only — trigger and sheet are hidden from md up', () => {
    setup()
    expect(trigger()).toHaveClass('md:hidden')
    expect(sheet().className).toContain('md:hidden')
  })

  it('is collapsed by default: sheet hidden, no backdrop', () => {
    setup()
    expect(sheet()).toHaveAttribute('hidden')
    expect(sheet()).not.toHaveAttribute('role', 'dialog')
    expect(screen.queryByTestId('board-controls-backdrop')).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveAttribute('aria-controls', 'board-mobile-controls')
  })

  it('tapping the trigger requests open', () => {
    const { props } = setup()
    fireEvent.click(trigger())
    expect(props.onOpenChange).toHaveBeenCalledWith(true)
  })

  it('when open it is a modal dialog with a backdrop and the controls are stacked with labels', () => {
    setup({ open: true })
    expect(sheet()).not.toHaveAttribute('hidden')
    expect(sheet()).toHaveAttribute('role', 'dialog')
    expect(sheet()).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('board-controls-backdrop')).toBeInTheDocument()

    expect(screen.getByText('Saved searches')).toBeInTheDocument()
    expect(screen.getByLabelText('Group by')).toBeInTheDocument()
    expect(screen.getByText('Card layout')).toBeInTheDocument()
    expect(screen.getByText(/Board scope — Sprint 7/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage sprints' })).toBeInTheDocument()
  })

  it('closes from the backdrop, the close button and Escape', () => {
    const { props, rerender } = setup({ open: true })
    fireEvent.click(screen.getByTestId('board-controls-backdrop'))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)

    props.onOpenChange.mockClear?.()
    fireEvent.click(screen.getByRole('button', { name: 'Close view options' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)

    props.onOpenChange.mockClear?.()
    rerender(<BoardMobileControls {...props} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('hides the kanban-only controls in other views', () => {
    setup({ open: true, showKanbanControls: false })
    expect(screen.queryByLabelText('Group by')).not.toBeInTheDocument()
    expect(screen.queryByText('Card layout')).not.toBeInTheDocument()
    expect(screen.getByText('Saved searches')).toBeInTheDocument()
  })

  it('changing Group by reports the new swimlane mode', () => {
    const { props } = setup({ open: true })
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'assignee' } })
    expect(props.onSwimlaneChange).toHaveBeenCalledWith('assignee')
  })

  it('card layout is a 3-way segment driven by the existing compact/grid toggles', () => {
    const { props } = setup({ open: true })
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    expect(props.onToggleCompact).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    expect(props.onToggleGrid).toHaveBeenCalled()
  })

  it('"Comfortable" clears whichever layout toggle is on', () => {
    const { props } = setup({ open: true, compact: true })
    fireEvent.click(screen.getByRole('button', { name: 'Comfortable' }))
    expect(props.onToggleCompact).toHaveBeenCalled()
    expect(props.onToggleGrid).not.toHaveBeenCalled()
  })

  it('applying a saved search closes the sheet', () => {
    const { props } = setup({ open: true })
    fireEvent.click(screen.getByRole('button', { name: 'My bugs' }))
    expect(props.onApplySavedSearch).toHaveBeenCalledWith(SAVED[0])
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('offers the save-current-filters input only when filters are active', () => {
    const { unmount } = setup({ open: true, canSaveSearch: false })
    expect(screen.queryByPlaceholderText(/Name this search/)).not.toBeInTheDocument()
    unmount()

    setup({ open: true, canSaveSearch: true })
    expect(screen.getByPlaceholderText(/Name this search/)).toBeInTheDocument()
  })

  it('flags non-default secondary settings with a dot on the trigger', () => {
    const { unmount } = setup({ swimlaneMode: 'none', compact: false, gridMode: false, sprintPanelOpen: false })
    expect(trigger().querySelector('span.bg-brand')).toBeNull()
    unmount()

    setup({ swimlaneMode: 'assignee' })
    expect(trigger().querySelector('span.bg-brand')).not.toBeNull()
  })

  it('toggling the sprint panel also dismisses the sheet', () => {
    const { props } = setup({ open: true })
    fireEvent.click(screen.getByRole('button', { name: 'Manage sprints' }))
    expect(props.onToggleSprintPanel).toHaveBeenCalled()
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })
})
