import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DevelopmentSection, { devLinkLabel } from '../../src/components/DevelopmentSection'
import type { TaskDevLink } from '../../src/types'

let mockLinks: TaskDevLink[] = []
let mockLoading = false

vi.mock('../../src/hooks/useVcs', () => ({
  useDevLinks: () => ({ data: mockLinks, isLoading: mockLoading }),
}))

const pr: TaskDevLink = {
  id: 'l1', kind: 'pr', external_id: '101', number: 42, title: 'Fix ORB-7',
  url: 'https://github.com/o/r/pull/42', state: 'merged', author_login: 'octocat', created_at: '',
  provider: 'github', repo_identifier: 'dating_app_main',
}

beforeEach(() => {
  mockLinks = []
  mockLoading = false
})

describe('DevelopmentSection', () => {
  it('shows empty state when no links', () => {
    render(<DevelopmentSection projectId="p1" taskId="t1" />)
    expect(screen.getByText(/no linked branches/i)).toBeInTheDocument()
  })

  it('renders a linked PR with number, link and state badge', () => {
    mockLinks = [pr]
    render(<DevelopmentSection projectId="p1" taskId="t1" />)
    const link = screen.getByRole('link', { name: /#42 Fix ORB-7/ })
    expect(link).toHaveAttribute('href', 'https://github.com/o/r/pull/42')
    expect(screen.getByText('merged')).toBeInTheDocument()
  })

  it('groups links by repository (disambiguates multiple repos)', () => {
    mockLinks = [
      pr,
      { ...pr, id: 'l2', number: 7, repo_identifier: 'dating_app_libs', state: 'open' },
      { ...pr, id: 'l3', kind: 'branch', external_id: 'feat/x', title: 'feat/x', repo_identifier: 'dating_app_libs', state: 'open' },
    ]
    render(<DevelopmentSection projectId="p1" taskId="t1" />)
    const groups = screen.getAllByTestId('dev-repo-group')
    expect(groups).toHaveLength(2)
    expect(screen.getByText('dating_app_main')).toBeInTheDocument()
    expect(screen.getByText('dating_app_libs')).toBeInTheDocument()
  })

  // HW-19: the sidebar is ~208px wide, so a one-line row cut branch names to a
  // dozen characters. The name must be rendered whole and be hoverable in full.
  describe('long names are not cut off', () => {
    const LONG_BRANCH = 'alicaondreakova/hw-19-git-branches-aren-t-fully-seen-inside-modal-cut-off'

    it('renders the full branch name as text, not an elided prefix', () => {
      mockLinks = [{ ...pr, kind: 'branch', number: null, title: LONG_BRANCH, external_id: LONG_BRANCH }]
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      expect(screen.getByRole('link', { name: LONG_BRANCH })).toBeInTheDocument()
    })

    it('exposes the full name on hover via title', () => {
      mockLinks = [{ ...pr, kind: 'branch', number: null, title: LONG_BRANCH, external_id: LONG_BRANCH }]
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      expect(screen.getByRole('link', { name: LONG_BRANCH })).toHaveAttribute('title', LONG_BRANCH)
    })

    it('lets the name wrap instead of clipping it to one line', () => {
      mockLinks = [{ ...pr, kind: 'branch', number: null, title: LONG_BRANCH, external_id: LONG_BRANCH }]
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      const link = screen.getByRole('link', { name: LONG_BRANCH })
      expect(link.className).toContain('break-words')
      expect(link.className).not.toContain('truncate')
    })

    it('keeps the PR state badge visible alongside a long name', () => {
      // HW-26: badges live on PRs, so the long-name + badge layout is exercised on a PR.
      mockLinks = [{ ...pr, title: LONG_BRANCH, external_id: LONG_BRANCH, state: 'open' }]
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      expect(screen.getByText('open')).toBeInTheDocument()
    })
  })

  // HW-26: group by kind within each repo (Pull Requests / Branches / Commits) instead
  // of one flat event stream, and drop the meaningless state chip from non-PR rows.
  describe('grouping by kind (HW-26)', () => {
    const mixed: TaskDevLink[] = [
      { ...pr, id: 'b1', kind: 'branch', number: null, title: 'feat/login', external_id: 'feat/login', state: 'open' },
      { ...pr, id: 'c1', kind: 'commit', number: null, title: 'wire up login', external_id: 'deadbeef1', state: 'open' },
      { ...pr, id: 'p1', kind: 'pr', number: 42, title: 'Add login', external_id: '42', state: 'merged' },
      { ...pr, id: 'c2', kind: 'commit', number: null, title: 'fix test', external_id: 'deadbeef2', state: 'open' },
    ]

    it('renders a section header per present kind', () => {
      mockLinks = mixed
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      expect(screen.getByText('Pull Requests')).toBeInTheDocument()
      expect(screen.getByText('Branches')).toBeInTheDocument()
      expect(screen.getByText('Commits')).toBeInTheDocument()
    })

    it('orders the sections Pull Requests, Branches, Commits', () => {
      mockLinks = mixed
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      const headers = screen.getAllByTestId('dev-kind-header').map((h) => h.textContent)
      expect(headers).toEqual(['Pull Requests', 'Branches', 'Commits'])
    })

    it('shows no header for a kind that is absent', () => {
      mockLinks = [mixed[1], mixed[3]]  // two commits, nothing else
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      expect(screen.getByText('Commits')).toBeInTheDocument()
      expect(screen.queryByText('Pull Requests')).not.toBeInTheDocument()
      expect(screen.queryByText('Branches')).not.toBeInTheDocument()
    })

    it('shows the state chip on the PR only, not on branches or commits', () => {
      mockLinks = mixed
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      const chips = screen.getAllByTestId('dev-state-chip')
      expect(chips).toHaveLength(1)
      expect(chips[0]).toHaveTextContent('merged')
    })

    it('renders every link — grouping drops nothing', () => {
      mockLinks = mixed
      render(<DevelopmentSection projectId="p1" taskId="t1" />)
      for (const label of ['#42 Add login', 'feat/login', 'wire up login', 'fix test']) {
        expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
      }
    })
  })

  describe('devLinkLabel', () => {
    it('prefixes pull requests with their number', () => {
      expect(devLinkLabel(pr)).toBe('#42 Fix ORB-7')
    })

    it('uses the bare title for branches', () => {
      expect(devLinkLabel({ ...pr, kind: 'branch', number: null, title: 'feat/x' })).toBe('feat/x')
    })

    it('falls back to a short sha when a commit has no title', () => {
      expect(devLinkLabel({ ...pr, kind: 'commit', number: null, title: '', external_id: 'abcdef1234567890' }))
        .toBe('abcdef12')
    })
  })

  it('copies the branch suggestion to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<DevelopmentSection projectId="p1" taskId="t1" branchSuggestion="anon/orb-7-fix" />)
    fireEvent.click(screen.getByRole('button', { name: /copy branch name/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('anon/orb-7-fix'))
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })
})
