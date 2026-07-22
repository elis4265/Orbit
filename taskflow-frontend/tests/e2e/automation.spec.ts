/**
 * E2E for automation rules (Guided/Enforced). Verifies the engine end-to-end:
 * a rule's actions apply when its trigger fires, and Flow mode runs nothing.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { createVerifiedUser, uniqueEmail } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function ctx(token: string) {
  return playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}

test.describe.configure({ mode: 'serial' })

test.describe('Automation rules', () => {
  let token = ''
  let userId = ''
  let projectId = ''
  let boardId = ''

  test.beforeAll(async () => {
    token = await createVerifiedUser(uniqueEmail('auto'), `auto${Date.now()}`)
    const c = await ctx(token)
    userId = (await (await c.get(`${API_URL}/auth/me`)).json()).id
    projectId = (await (await c.post(`${API_URL}/projects`, { data: { name: 'Auto E2E' } })).json()).id
    boardId = (await (await c.post(`${API_URL}/projects/${projectId}/boards`, { data: { name: 'Main' } })).json()).id
    await c.dispose()
  })

  test('guided: a "when created → assign" rule assigns new tasks', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/mode`, { data: { mode: 'guided' } })

    const ruleRes = await c.post(`${API_URL}/projects/${projectId}/automation-rules`, {
      data: { name: 'Auto-assign on create', trigger: 'task_created', actions: [{ type: 'assign', assignee_id: userId }] },
    })
    expect(ruleRes.ok()).toBeTruthy()

    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'auto task' } })).json()
    expect(task.assignee_id).toBe(userId)   // rule fired during creation
    await c.dispose()
  })

  test('flow mode runs no automation (gate)', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/mode`, { data: { mode: 'open' } })   // Flow
    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'flow task' } })).json()
    expect(task.assignee_id).toBeNull()   // rule exists but Flow runs nothing
    await c.dispose()
  })

  test('rules list endpoint returns created rules', async () => {
    const c = await ctx(token)
    const list = await (await c.get(`${API_URL}/projects/${projectId}/automation-rules`)).json()
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list[0].trigger).toBe('task_created')
    await c.dispose()
  })

  test('condition: a rule only fires when its condition matches', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/mode`, { data: { mode: 'guided' } })
    // isolate: clear existing rules
    const existing = await (await c.get(`${API_URL}/projects/${projectId}/automation-rules`)).json()
    for (const r of existing) await c.delete(`${API_URL}/projects/${projectId}/automation-rules/${r.id}`)

    await c.post(`${API_URL}/projects/${projectId}/automation-rules`, {
      data: { name: 'assign bugs only', trigger: 'task_created', conditions: [{ field: 'issue_type', value: 'bug' }], actions: [{ type: 'assign', assignee_id: userId }] },
    })
    const plain = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'a task', issue_type: 'task' } })).json()
    const bug = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'a bug', issue_type: 'bug' } })).json()
    expect(plain.assignee_id).toBeNull()    // condition not met → no action
    expect(bug.assignee_id).toBe(userId)    // condition met → assigned
    await c.dispose()
  })

  test('operators: neq + is_empty across multiple conditions', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/mode`, { data: { mode: 'guided' } })
    const existing = await (await c.get(`${API_URL}/projects/${projectId}/automation-rules`)).json()
    for (const r of existing) await c.delete(`${API_URL}/projects/${projectId}/automation-rules/${r.id}`)

    // assign only when type is NOT epic AND assignee is empty (both must hold)
    await c.post(`${API_URL}/projects/${projectId}/automation-rules`, {
      data: {
        name: 'triage unassigned non-epics',
        trigger: 'task_created',
        conditions: [
          { field: 'issue_type', op: 'neq', value: 'epic' },
          { field: 'assignee', op: 'is_empty' },
        ],
        actions: [{ type: 'assign', assignee_id: userId }],
      },
    })
    const epic = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'an epic', issue_type: 'epic' } })).json()
    const story = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'a story', issue_type: 'story' } })).json()
    expect(epic.assignee_id).toBeNull()        // is epic → neq fails → AND fails
    expect(story.assignee_id).toBe(userId)     // not epic + unassigned → both conditions hold → fires
    await c.dispose()
  })
})
