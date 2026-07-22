export type KeyAction =
  | 'command-palette'
  | 'create-task'
  | 'shortcuts-help'
  | 'search'
  | 'next-board'
  | 'prev-board'
  | 'new-board'
  | 'members'
  | 'notifications'
  | 'issues'
  | 'export-import'
  | 'project-settings'
  | 'audit-log'
  | 'preferences'
  | 'my-work'
  | 'dashboard'
  | 'help'
  | 'cycle-theme'

export type KeyBindings = Record<KeyAction, string>

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  'command-palette': 'Ctrl+k',
  'create-task':    'c',
  'shortcuts-help': '?',
  'search':         '/',
  'next-board':     'ArrowRight',
  'prev-board':     'ArrowLeft',
  'new-board':      'b',
  'members':        'm',
  'notifications':  'n',
  // Every command-palette navigation target is also a first-class binding —
  // documented in the shortcuts modal and rebindable in Preferences.
  'issues':           'i',
  'export-import':    'e',
  'project-settings': 's',
  'audit-log':        'a',
  'preferences':      'p',
  'my-work':          'w',
  'dashboard':        'd',
  'help':             'h',
  'cycle-theme':      't',
}

export const ACTION_LABELS: Record<KeyAction, string> = {
  'command-palette': 'Open command palette',
  'create-task':    'Create new task',
  'shortcuts-help': 'Show keyboard shortcuts',
  'search':         'Search / filter',
  'next-board':     'Next board',
  'prev-board':     'Previous board',
  'new-board':      'New board',
  'members':        'Members',
  'notifications':  'Notifications',
  'issues':           'Go to Issues',
  'export-import':    'Go to Export & Import',
  'project-settings': 'Go to Project Settings',
  'audit-log':        'Go to Audit Log',
  'preferences':      'Go to Preferences',
  'my-work':          'Go to My Work',
  'dashboard':        'Go to Dashboard',
  'help':             'Go to Help',
  'cycle-theme':      'Cycle theme (light / dark / system)',
}

// Additional shortcuts that are context-local (not global), shown in help only
export const CONTEXT_SHORTCUTS = [
  { label: 'Close modal / cancel', key: 'Escape' },
  { label: 'Submit comment / save', key: 'Ctrl+Enter' },
]

export function loadKeybindings(): KeyBindings {
  try {
    const stored = localStorage.getItem('orbit:keybindings')
    if (stored) {
      const overrides = JSON.parse(stored) as Partial<KeyBindings>
      return { ...DEFAULT_KEYBINDINGS, ...overrides }
    }
  } catch {
    // ignore malformed JSON
  }
  return { ...DEFAULT_KEYBINDINGS }
}

export function matchesKey(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.split('+')
  const key = parts[parts.length - 1]
  // `Ctrl+` in a binding means "Cmd-or-Ctrl" so the same chord works on mac + others.
  const wantMod = parts.includes('Ctrl')
  const shift = parts.includes('Shift')
  const alt = parts.includes('Alt')
  const mod = e.ctrlKey || e.metaKey
  return (
    e.key === key &&
    mod === wantMod &&
    e.shiftKey === shift &&
    e.altKey === alt
  )
}
