// REQ-159 (DD-051) — pure CSV generation for "Export view"; download helper.

export interface CsvColumn<T> {
  header: string
  cell: (row: T) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.cell(row))).join(','))
  }
  return lines.join('\n') + '\n'
}

export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Mirror of the backend whitelist (services/task_export.py EXPORT_FIELDS).
// `custom_fields` expands server-side to one column per definition.
export const SERVER_EXPORT_FIELDS: string[] = [
  'key', 'id', 'title', 'description', 'issue_type', 'status', 'custom_status',
  'parent_key', 'assignee', 'created_by', 'priority', 'severity', 'tags',
  'sprint', 'release', 'estimate', 'business_value', 'start_date', 'due_date',
  'created_at', 'updated_at', 'completed_at', 'time_spent_minutes', 'custom_fields',
]
