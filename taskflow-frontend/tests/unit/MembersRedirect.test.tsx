// REQ-165 — /projects/:id/members must not 404: it redirects to Settings → Members
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import MembersPage from '../../src/pages/MembersPage'

function SettingsProbe() {
  const { workspaceId } = useParams()
  const location = useLocation()
  return <div data-testid="settings-probe">{workspaceId}:{location.search}</div>
}

describe('REQ-165 — old members URL redirects', () => {
  it('redirects /projects/:id/members to settings?tab=members, preserving the segment', () => {
    render(
      <MemoryRouter initialEntries={['/projects/orb/members']}>
        <Routes>
          <Route path="/projects/:workspaceId/members" element={<MembersPage />} />
          <Route path="/projects/:workspaceId/settings" element={<SettingsProbe />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('settings-probe')).toHaveTextContent('orb:?tab=members')
  })
})
