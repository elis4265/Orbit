import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import IssueTypeBadge, { ISSUE_TYPE_OPTIONS } from '../../src/components/IssueTypeBadge'
import type { IssueType } from '../../src/types'

function renderBadge(type: IssueType, showLabel = false) {
  return render(<IssueTypeBadge type={type} showLabel={showLabel} />)
}

describe('IssueTypeBadge', () => {
  it('renders without crashing for each type', () => {
    const types: IssueType[] = ['epic', 'story', 'task', 'bug']
    types.forEach((type) => {
      const { unmount } = renderBadge(type)
      unmount()
    })
  })

  it('shows label text when showLabel is true', () => {
    renderBadge('epic', true)
    expect(screen.getByText('Epic')).toBeInTheDocument()
  })

  it('shows label text for story', () => {
    renderBadge('story', true)
    expect(screen.getByText('Story')).toBeInTheDocument()
  })

  it('shows label text for task', () => {
    renderBadge('task', true)
    expect(screen.getByText('Task')).toBeInTheDocument()
  })

  it('shows label text for bug', () => {
    renderBadge('bug', true)
    expect(screen.getByText('Bug')).toBeInTheDocument()
  })

  it('does not render label text when showLabel is false', () => {
    renderBadge('epic', false)
    expect(screen.queryByText('Epic')).not.toBeInTheDocument()
  })

  it('sets title attribute for accessibility', () => {
    const { container } = renderBadge('bug', false)
    const span = container.querySelector('[title="Bug"]')
    expect(span).not.toBeNull()
  })

  it('applies purple color class for epic', () => {
    const { container } = renderBadge('epic')
    expect(container.firstChild).toHaveClass('text-purple-400')
  })

  it('applies red color class for bug', () => {
    const { container } = renderBadge('bug')
    expect(container.firstChild).toHaveClass('text-red-400')
  })

  it('applies blue color class for story', () => {
    const { container } = renderBadge('story')
    expect(container.firstChild).toHaveClass('text-blue-400')
  })

  it('applies gray color class for task', () => {
    const { container } = renderBadge('task')
    expect(container.firstChild).toHaveClass('text-gray-400')
  })

  it('pill variant renders a colored chip with the label', () => {
    const { container } = render(<IssueTypeBadge type="epic" pill />)
    expect(screen.getByText('Epic')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('border')
    expect(container.firstChild).toHaveClass('text-purple-300')
  })

  it('ISSUE_TYPE_OPTIONS has all four types', () => {
    const values = ISSUE_TYPE_OPTIONS.map((o) => o.value)
    expect(values).toContain('epic')
    expect(values).toContain('story')
    expect(values).toContain('task')
    expect(values).toContain('bug')
    expect(values).toHaveLength(4)
  })
})
