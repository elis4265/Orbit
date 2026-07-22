import { useEffect, useRef } from 'react'
import { loadKeybindings, matchesKey, type KeyAction } from '../keybindings'

type Handlers = Partial<Record<KeyAction, () => void>>

function isEditable(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable
  )
}

export function useKeyBindings(handlers: Handlers) {
  // Stable ref so the effect never needs to re-register
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const bindings = loadKeybindings()
      for (const [action, binding] of Object.entries(bindings) as [KeyAction, string][]) {
        const handler = handlersRef.current[action]
        if (!handler) continue
        if (!matchesKey(e, binding)) continue

        // Single-key bindings (no modifier) skip when focus is inside an editable element
        const hasModifier = e.ctrlKey || e.altKey || e.metaKey
        if (!hasModifier && isEditable(document.activeElement)) continue

        e.preventDefault()
        handler()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // intentionally empty — handlersRef keeps current handlers
}
