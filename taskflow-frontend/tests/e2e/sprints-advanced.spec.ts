/**
 * E2E backfill for the sprint/cycle/SP work that the older UI-driven
 * sprints.spec.ts predates: committed-points snapshot on activate, the
 * Complete-Sprint move-to-backlog flow, and Flow auto-cycles.
 * API-driven against the live stack.
 * (Planning poker is WebSocket-only — covered by PokerRoom unit tests.)
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { createVerifiedUser, uniqueEmail } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function ctx(token: string) {
  return playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}
const today = () => new Date().toISOString().slice(0, 10)
const plus = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)

test.describe.configure({ mode: 'serial' })

test.describe('Sprints, complete-sprint & cycles', () => {
  let token = ''
  let projectId = ''
  let boardId = ''

  test.beforeAll(async () => {
    token = await createVerifiedUser(uniqueEmail('spadv'), `spadv${Date.now()}`)
    const c = await ctx(token)
    projectId = (await (await c.post(`${API_URL}/projects`, { data: { name: 'SP Adv E2E' } })).json()).id
    boardId = (await (await c.post(`${API_URL}/projects/${projectId}/boards`, { data: { name: 'Main' } })).json()).id
    await c.dispose()
  })

  test('committed_points snapshots on activate; Complete Sprint sends incomplete to backlog', async () => {
    const c = await ctx(token)
    const sp = `${API_URL}/projects/${projectId}/boards/${boardId}/sprints`

    const sprint = await (await c.post(sp, { data: { name: 'S1', start_date: today(), end_date: plus(14) } })).json()
    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'incomplete' } })).json()

    // estimate 5 + assign to the sprint (task update is project-scoped)
    await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { estimate: 5, version: task.version } })
    await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { sprint_id: sprint.id, version: task.version + 1 } })

    // activate → committed_points snapshot = 5
    const active = await (await c.post(`${sp}/${sprint.id}/activate`, {})).json()
    expect(active.committed_points).toBe(5)

    // complete → incomplete task moves to backlog (sprint_id null), sprint closed
    const done = await c.post(`${sp}/${sprint.id}/complete`, { data: { incomplete_action: 'backlog' } })
    expect(done.ok()).toBeTruthy()
    expect((await done.json()).status).toBe('closed')

    const backlog = await (await c.get(`${API_URL}/projects/${projectId}/tasks?sprint_id=none`)).json()
    expect(backlog.some((t: { id: string }) => t.id === task.id)).toBeTruthy()
    await c.dispose()
  })

  test('Flow auto-cycles: enabling cycle config materializes current + upcoming cycles', async () => {
    const c = await ctx(token)
    const cfg = await c.put(`${API_URL}/projects/${projectId}/cycle-config`, {
      data: { enabled: true, duration_weeks: 2, cooldown_days: 0, start_anchor: today(), upcoming_count: 2 },
    })
    expect(cfg.ok()).toBeTruthy()

    const cycles = await (await c.get(`${API_URL}/projects/${projectId}/cycles`)).json()
    expect(cycles.length).toBeGreaterThanOrEqual(1)
    expect(cycles.some((s: { status: string }) => s.status === 'active')).toBeTruthy()

    // disabling closes the active cycle and drops upcoming
    await c.put(`${API_URL}/projects/${projectId}/cycle-config`, {
      data: { enabled: false, duration_weeks: 2, cooldown_days: 0, start_anchor: today(), upcoming_count: 2 },
    })
    const after = await (await c.get(`${API_URL}/projects/${projectId}/cycles`)).json()
    expect(after.every((s: { status: string }) => s.status !== 'planned')).toBeTruthy()
    await c.dispose()
  })
})
