// YouTrack-style collapsible left sidebar: global + project navigation,
// active-item highlight, icons-only collapse persisted in localStorage.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Sidebar from '../../src/components/Sidebar'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}{location.search}</div>
}

function renderSidebar(initialEntry: string, projectSeg?: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar projectSeg={projectSeg} />
      <LocationProbe />
    </MemoryRouter>
  )
}

const GLOBAL_LABELS = ['My Work', 'Dashboard']
const PROJECT_LABELS = ['Board', 'Issues', 'Analytics', 'Members', 'Export & Import', 'Settings']

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders global items without a project, and no project section', () => {
    renderSidebar('/my-work')
    for (const label of GLOBAL_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    for (const label of PROJECT_LABELS) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
  })

  it('renders the project section when a project segment is supplied', () => {
    renderSidebar('/projects/orb', 'orb')
    expect(screen.getByText('Project')).toBeInTheDocument()
    for (const label of [...GLOBAL_LABELS, ...PROJECT_LABELS]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('navigates on click, using the project segment for project items', () => {
    renderSidebar('/projects/orb', 'orb')
    fireEvent.click(screen.getByRole('button', { name: 'Issues' }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/projects/orb/issues')

    fireEvent.click(screen.getByRole('button', { name: 'Members' }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/projects/orb/settings?tab=members')

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/dashboard')
  })

  it('highlights the active item from the current location', () => {
    renderSidebar('/projects/orb/audit-log', 'orb')
    const analytics = screen.getByRole('button', { name: 'Analytics' })
    expect(analytics).toHaveClass('text-brand')
    expect(analytics).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Issues' })).not.toHaveClass('text-brand')
  })

  it('Board item navigates to the project board page', () => {
    renderSidebar('/projects/orb/issues', 'orb')
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/projects/orb')
  })

  it('Board is active only on the exact board path — not on sub-pages', () => {
    const { unmount } = renderSidebar('/projects/orb', 'orb')
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-current', 'page')
    unmount()

    renderSidebar('/projects/orb/issues', 'orb')
    expect(screen.getByRole('button', { name: 'Board' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Issues' })).toHaveAttribute('aria-current', 'page')
  })

  it('no project item is active on a global page even with a project section', () => {
    renderSidebar('/my-work', 'orb')
    expect(screen.getByRole('button', { name: 'My Work' })).toHaveAttribute('aria-current', 'page')
    for (const label of PROJECT_LABELS) {
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('aria-current')
    }
  })

  it('disambiguates Members vs Settings via the tab query param', () => {
    const { unmount } = renderSidebar('/projects/orb/settings?tab=members', 'orb')
    expect(screen.getByRole('button', { name: 'Members' })).toHaveClass('text-brand')
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveClass('text-brand')
    unmount()

    renderSidebar('/projects/orb/settings', 'orb')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('text-brand')
    expect(screen.getByRole('button', { name: 'Members' })).not.toHaveClass('text-brand')
  })

  it('collapses to icons only and persists the state to localStorage', () => {
    renderSidebar('/projects/orb', 'orb')
    expect(screen.getByText('My Work')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    // Labels are gone; buttons stay reachable by aria-label (+ title tooltip).
    expect(screen.queryByText('My Work')).not.toBeInTheDocument()
    expect(screen.queryByText('Issues')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issues' })).toBeInTheDocument()
    expect(localStorage.getItem('orbit.sidebar.collapsed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByText('My Work')).toBeInTheDocument()
    expect(localStorage.getItem('orbit.sidebar.collapsed')).toBe('false')
  })

  it('starts collapsed when localStorage says so', () => {
    localStorage.setItem('orbit.sidebar.collapsed', 'true')
    renderSidebar('/my-work')
    expect(screen.queryByText('My Work')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })
})
