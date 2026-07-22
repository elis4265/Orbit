import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfoTooltip from '../../src/components/InfoTooltip'

describe('InfoTooltip', () => {
  it('renders an info icon', () => {
    const { container } = render(<InfoTooltip text="Explanation here" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('contains the tooltip text in the DOM (hidden by default via CSS)', () => {
    render(<InfoTooltip text="Some helpful explanation" />)
    expect(screen.getByText('Some helpful explanation')).toBeInTheDocument()
  })

  it('tooltip text is hidden by default (group-hover pattern)', () => {
    const { container } = render(<InfoTooltip text="Hidden text" />)
    const popover = container.querySelector('.hidden')
    expect(popover).toBeInTheDocument()
  })

  it('applies custom width class when provided', () => {
    const { container } = render(<InfoTooltip text="Wide tooltip" width="w-80" />)
    expect(container.querySelector('.w-80')).toBeInTheDocument()
  })

  it('defaults to w-64 width', () => {
    const { container } = render(<InfoTooltip text="Default width" />)
    expect(container.querySelector('.w-64')).toBeInTheDocument()
  })
})
