// REQ-157 (DD-050) — bulk command parser. Same @field:value dialect as the
// SmartFilterBar, extended with @tag:+name / @tag:-name set operations.
// Pure: parse + resolve names → ids against caller-supplied context; the
// backend receives a typed payload and never parses commands.

export interface BulkCommandContext {
  meId: string
  mode: 'open' | 'guided' | 'enforced'
  members: { id: string; username: string | null; email: string }[]
  statuses: { id: string; name: string }[]
  sprints: { id: string; name: string }[]
  priorities: { id: string; name: string }[]
  tags: { id: string; name: string }[]
}

export interface BulkCommandResult {
  /** BulkChanges payload for PATCH /tasks/bulk — empty object when errors exist */
  changes: Record<string, unknown>
  /** Human-readable summary lines, one per parsed token */
  preview: string[]
  errors: string[]
}

const OPEN_STATUS: Record<string, string> = {
  'todo': 'todo',
  'to do': 'todo',
  'in progress': 'in_progress',
  'in_progress': 'in_progress',
  'done': 'done',
}

const TOKEN_RE = /@(\w+):("[^"]*"|\S+)/g

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

export function parseBulkCommand(input: string, ctx: BulkCommandContext): BulkCommandResult {
  const errors: string[] = []
  const preview: string[] = []
  const changes: Record<string, unknown> = {}
  const addTagIds: string[] = []
  const removeTagIds: string[] = []

  if (!input.trim()) {
    return { changes: {}, preview: [], errors: ['Empty command.'] }
  }

  // Everything must be consumed by @field:value tokens — leftovers are junk.
  const leftover = input.replace(TOKEN_RE, '').trim()
  if (leftover) {
    errors.push(`Unrecognized input: "${leftover}" — expected @field:value tokens.`)
  }

  const byName = <T extends { id: string }>(list: T[], name: (t: T) => string, value: string) =>
    list.find((t) => name(t).toLowerCase() === value.toLowerCase())

  for (const match of input.matchAll(TOKEN_RE)) {
    const field = match[1].toLowerCase()
    const value = unquote(match[2])

    switch (field) {
      case 'status': {
        if (ctx.mode === 'open') {
          const enumStatus = OPEN_STATUS[value.toLowerCase()]
          if (!enumStatus) { errors.push(`Unknown status "${value}".`); break }
          changes.status = enumStatus
          preview.push(`Set status → ${value}`)
        } else {
          const st = byName(ctx.statuses, (s) => s.name, value)
          if (!st) { errors.push(`Unknown status "${value}".`); break }
          changes.custom_status_id = st.id
          preview.push(`Set status → ${st.name}`)
        }
        break
      }
      case 'assignee': {
        if (value.toLowerCase() === 'me') {
          changes.assignee_id = ctx.meId
          preview.push('Assign → me')
        } else if (value.toLowerCase() === 'none') {
          changes.assignee_id = null
          preview.push('Clear assignee')
        } else {
          const m = ctx.members.find(
            (u) => u.username?.toLowerCase() === value.toLowerCase()
              || u.email.toLowerCase() === value.toLowerCase()
          )
          if (!m) { errors.push(`Unknown assignee "${value}".`); break }
          changes.assignee_id = m.id
          preview.push(`Assign → ${m.username ?? m.email}`)
        }
        break
      }
      case 'priority': {
        if (value.toLowerCase() === 'none') {
          changes.priority_id = null
          preview.push('Clear priority')
        } else {
          const p = byName(ctx.priorities, (x) => x.name, value)
          if (!p) { errors.push(`Unknown priority "${value}".`); break }
          changes.priority_id = p.id
          preview.push(`Set priority → ${p.name}`)
        }
        break
      }
      case 'sprint': {
        if (value.toLowerCase() === 'none') {
          changes.sprint_id = null
          preview.push('Remove from sprint')
        } else {
          const s = byName(ctx.sprints, (x) => x.name, value)
          if (!s) { errors.push(`Unknown sprint "${value}".`); break }
          changes.sprint_id = s.id
          preview.push(`Set sprint → ${s.name}`)
        }
        break
      }
      case 'tag': {
        const op = value[0]
        const name = value.slice(1)
        if (op !== '+' && op !== '-') {
          errors.push(`Tag needs +name or -name (got "${value}").`)
          break
        }
        const tag = byName(ctx.tags, (t) => t.name, name)
        if (!tag) { errors.push(`Unknown tag "${name}".`); break }
        if (op === '+') { addTagIds.push(tag.id); preview.push(`Add tag ${tag.name}`) }
        else { removeTagIds.push(tag.id); preview.push(`Remove tag ${tag.name}`) }
        break
      }
      default:
        errors.push(`Unknown field "@${field}". Try @status @assignee @priority @sprint @tag.`)
    }
  }

  if (errors.length) return { changes: {}, preview, errors }

  if (addTagIds.length) changes.add_tag_ids = addTagIds
  if (removeTagIds.length) changes.remove_tag_ids = removeTagIds
  if (Object.keys(changes).length === 0) {
    return { changes: {}, preview, errors: ['Empty command.'] }
  }
  return { changes, preview, errors: [] }
}
