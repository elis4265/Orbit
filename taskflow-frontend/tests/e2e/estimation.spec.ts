/**
 * E2E for estimation methods (#1 Story Points + #2 Flow forecast).
 * API-driven against the live stack — exercises the real endpoints end to end,
 * and guards the task.estimate round-trip (TaskUpdate ↔ TaskResponse parity).
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { createVerifiedUser, uniqueEmail } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function ctx(token: string) {
  return playwrightRequest.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}

test.describe.configure({ mode: 'serial' })

test.describe('Estimation methods', () => {
  let token = ''
  let projectId = ''
  let boardId = ''

  test.beforeAll(async () => {
    const email = uniqueEmail('estim')
    token = await createVerifiedUser(email, `estim${Date.now()}`)
    const c = await ctx(token)
    const proj = await (await c.post(`${API_URL}/projects`, { data: { name: 'Estim E2E' } })).json()
    projectId = proj.id
    const board = await (await c.post(`${API_URL}/projects/${projectId}/boards`, { data: { name: 'Main' } })).json()
    boardId = board.id
    await c.dispose()
  })

  test('story_points: set method, estimate round-trips, velocity endpoint works', async () => {
    const c = await ctx(token)

    const setRes = await c.patch(`${API_URL}/projects/${projectId}/estimation-method`, { data: { estimation_method: 'story_points' } })
    expect(setRes.ok()).toBeTruthy()

    const projects = await (await c.get(`${API_URL}/projects`)).json()
    expect(projects.find((p: { id: string }) => p.id === projectId).estimation_method).toBe('story_points')

    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'Sized task' } })).json()
    const upd = await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { estimate: 5, version: task.version } })
    expect(upd.ok()).toBeTruthy()
    expect((await upd.json()).estimate).toBe(5)   // round-trips back (parity guard)

    const velocity = await c.get(`${API_URL}/projects/${projectId}/stats/velocity`)
    expect(velocity.ok()).toBeTruthy()
    const v = await velocity.json()
    expect(Array.isArray(v.sprints)).toBeTruthy()

    await c.dispose()
  })

  test('flow: switch method and forecast endpoint returns a (cold-start) forecast', async () => {
    const c = await ctx(token)

    const setRes = await c.patch(`${API_URL}/projects/${projectId}/estimation-method`, { data: { estimation_method: 'flow' } })
    expect(setRes.ok()).toBeTruthy()

    const forecast = await c.get(`${API_URL}/projects/${projectId}/stats/forecast`)
    expect(forecast.ok()).toBeTruthy()
    const f = await forecast.json()
    expect(f).toHaveProperty('enough_data')
    expect(f).toHaveProperty('throughput')
    expect(f.enough_data).toBe(false)   // new project → no history yet

    await c.dispose()
  })

  test('baseline: predicts effort once there are enough finished tasks', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/estimation-method`, { data: { estimation_method: 'baseline' } })

    // finish a few tasks so the local model has data (done → logs the activity)
    for (const title of ['login bug fix', 'login styling tweak', 'database migration refactor']) {
      const t = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title } })).json()
      await c.patch(`${API_URL}/projects/${projectId}/tasks/${t.id}`, { data: { status: 'done', version: t.version } })
    }

    const target = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'login authentication bug' } })).json()
    const pred = await (await c.get(`${API_URL}/projects/${projectId}/tasks/${target.id}/prediction`)).json()
    expect(pred.enough_data).toBe(true)
    expect(typeof pred.predicted_days).toBe('number')
    expect(pred.neighbors.length).toBeGreaterThan(0)
    expect(pred).toHaveProperty('surprise')   // surprise flag present

    await c.dispose()
  })

  test('impact: business_value round-trips for WSJF-lite ranking', async () => {
    const c = await ctx(token)
    await c.patch(`${API_URL}/projects/${projectId}/estimation-method`, { data: { estimation_method: 'impact' } })

    const task = await (await c.post(`${API_URL}/projects/${projectId}/boards/${boardId}/tasks`, { data: { title: 'high-value task' } })).json()
    const upd = await c.patch(`${API_URL}/projects/${projectId}/tasks/${task.id}`, { data: { business_value: 5, estimate: 2, version: task.version } })
    expect(upd.ok()).toBeTruthy()
    const body = await upd.json()
    expect(body.business_value).toBe(5)   // parity guard
    expect(body.estimate).toBe(2)

    await c.dispose()
  })
})
