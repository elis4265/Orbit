import type { Tag } from '../types'

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // WCAG relative luminance simplified
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#111827' : '#ffffff'
}

interface TagPillProps {
  tag: Tag
  onRemove?: () => void
  onClick?: () => void
}

export default function TagPill({ tag, onRemove, onClick }: TagPillProps) {
  const text = contrastColor(tag.color)
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium select-none ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      style={{ backgroundColor: tag.color, color: text }}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 hover:opacity-70 leading-none"
          style={{ color: text }}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          aria-label={`Remove tag ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
