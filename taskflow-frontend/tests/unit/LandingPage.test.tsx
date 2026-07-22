import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Importing App pulls the full page graph incl. the Tiptap CodeMirror node;
// vitest's node resolver can't load that package's dist subpath (Vite can).
vi.mock('prosemirror-codemirror-6', () => ({ CodeMirrorView: class {} }))

import LandingPage from '../../src/pages/LandingPage'
import App from '../../src/App'

describe('Landing page', () => {
  it('renders pitch, mascot, and both CTAs', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Task tracking for teams that ship.')).toBeInTheDocument()
    expect(screen.getByAltText(/Orbit pig/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/register')
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
  })

  it('renders all six feature tiles', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )
    for (const title of [
      'Boards, sprints, backlog',
      'Realtime descriptions',
      'Git integration',
      'Charts & forecasting',
      'Fast search',
      'Self-hostable',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  it('renders the three workflow modes with pig illustrations', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )
    for (const mode of ['Flow', 'Guided', 'Enforced']) {
      expect(screen.getByRole('heading', { name: mode })).toBeInTheDocument()
      expect(screen.getByAltText(`${mode} mode illustrated as a pig farm in space`)).toBeInTheDocument()
    }
  })

  it('signed-out visit to / shows the landing page, not the app', async () => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(await screen.findByText('Task tracking for teams that ship.')).toBeInTheDocument()
  })
})
