/**
 * E2E for custom fields (Guided defines/optional, Enforced required-capable).
 * API-driven against the live stack — covers value round-trip + required gate.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { createVerifiedUser, uniqueEmail } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function ctx(token: string) {
  return playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}

test.describe.configure({ mode: 'serial' })

test.describe('Custom fields', () => {
  let token = ''
  let projectId = ''
  let boardId = ''

  test.beforeAll(async () => {
    token = await createVerifiedUser(uniqueEmail('cf'), `cf${Date.now()}`)
    const c = await ctx(token)
    projectId = (await (await c.post(`${API_URL}/projects`, { data: { name: 'CF E2E' } })).json()).id
    boardId = (await (await c.post(`${API_URL}/projects/${projectId}/boards`, { data: { name: 'Main' } })).json()).id
    await c.dispose()
  })

  test('guided: define a field and its value round-trips on a task', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/mode`, { data: { mode: 'guided' } })

    const field = await (await c.post(`${API_URL}/projects/${projectId}/custom-fields`, { data: { name: 'Component', field_type: 'text' } })).json()
    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'cf task' } })).json()

    const upd = await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { custom_fields: { [field.id]: 'api' }, version: task.version } })
    expect(upd.ok()).toBeTruthy()
    expect((await upd.json()).custom_fields[field.id]).toBe('api')   // round-trips
    await c.dispose()
  })

  test('enforced: a required field blocks save until it is set', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/mode`, { data: { mode: 'enforced' } })

    const req = await (await c.post(`${API_URL}/projects/${projectId}/custom-fields`, {
      data: { name: 'Severity', field_type: 'select', options: ['low', 'high'], required: true },
    })).json()
    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'needs sev' } })).json()

    // touch custom_fields without the required select → blocked
    const bad = await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { custom_fields: {}, version: task.version } })
    expect(bad.status()).toBe(422)

    // set the required value → ok
    const good = await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { custom_fields: { [req.id]: 'high' }, version: task.version } })
    expect(good.ok()).toBeTruthy()
    expect((await good.json()).custom_fields[req.id]).toBe('high')
    await c.dispose()
  })

  test('select rejects a value outside its options', async () => {
    const c = await ctx(token)
    const sel = await (await c.post(`${API_URL}/projects/${projectId}/custom-fields`, {
      data: { name: 'Tier', field_type: 'select', options: ['a', 'b'] },
    })).json()
    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'tier task' } })).json()
    const bad = await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { custom_fields: { [sel.id]: 'zzz' }, version: task.version } })
    expect(bad.status()).toBe(422)
    await c.dispose()
  })
})
