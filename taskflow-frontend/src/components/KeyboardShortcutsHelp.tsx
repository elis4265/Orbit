import { useEffect } from 'react'
import { X } from 'lucide-react'
import { loadKeybindings, ACTION_LABELS, CONTEXT_SHORTCUTS, type KeyAction } from '../keybindings'

interface Props {
  onClose: () => void
}

function KeyChip({ binding }: { binding: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {binding.split('+').map((part, i) => (
        <kbd
          key={i}
          className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-700 border border-gray-600 rounded text-gray-200"
        >
          {part}
        </kbd>
      ))}
    </span>
  )
}

export default function KeyboardShortcutsHelp({ onClose }: Props) {
  const bindings = loadKeybindings()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const globalEntries = Object.entries(ACTION_LABELS) as [KeyAction, string][]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-200">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-gray-500 mb-3">Global (not inside a text field)</p>
          {globalEntries.map(([action, label]) => (
            <div key={action} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-300">{label}</span>
              <KeyChip binding={bindings[action]} />
            </div>
          ))}

          <div className="border-t border-gray-800 my-3" />
          <p className="text-xs text-gray-500 mb-3">Context-specific</p>
          {CONTEXT_SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-300">{s.label}</span>
              <KeyChip binding={s.key} />
            </div>
          ))}

          <div className="border-t border-gray-800 mt-4 pt-3">
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Customise: set <code className="text-gray-500">orbit:keybindings</code> in{' '}
              <code className="text-gray-500">localStorage</code> as a JSON object
              with action → key overrides.
            </p>
            <p className="text-[11px] text-gray-600 mt-1">
              Example: <code className="text-gray-500">{'{"create-task":"t"}'}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
