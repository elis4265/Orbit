/**
 * E2E for cross-project (global) search — GET /search/tasks spans every project
 * the caller can access, and never leaks other users' projects.
 */
import { test, expect, request as pr } from '@playwright/test'
import { createVerifiedUser, uniqueEmail } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'
const KW = `zqx${Date.now()}`   // unique keyword so results are deterministic

async function ctx(token: string) {
  return pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}
async function makeTask(c: Awaited<ReturnType<typeof ctx>>, title: string): Promise<string> {
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'CPS ' + title } })).json()).id
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title } })
  return pid
}

test('global search spans the caller’s projects and isolates other users', async () => {
  const aTok = await createVerifiedUser(uniqueEmail('cpsa'), `cpsa${Date.now()}`)
  const bTok = await createVerifiedUser(uniqueEmail('cpsb'), `cpsb${Date.now()}`)
  const a = await ctx(aTok)
  const b = await ctx(bTok)

  await makeTask(a, `${KW} alpha`)   // user A, project 1
  await makeTask(a, `${KW} beta`)    // user A, project 2
  await makeTask(b, `${KW} gamma`)   // user B, project 3

  // A sees both of A's tasks, across two projects — never B's.
  const aRes = await (await a.get(`${API}/search/tasks`, { params: { q: KW } })).json()
  const aTitles = aRes.map((r: { title: string }) => r.title).sort()
  expect(aTitles).toEqual([`${KW} alpha`, `${KW} beta`])
  expect(new Set(aRes.map((r: { project_id: string }) => r.project_id)).size).toBe(2)  // two projects
  expect(aRes.every((r: { project_id: string }) => r.project_id)).toBeTruthy()          // project_id present

  // B sees only B's task.
  const bRes = await (await b.get(`${API}/search/tasks`, { params: { q: KW } })).json()
  expect(bRes.map((r: { title: string }) => r.title)).toEqual([`${KW} gamma`])

  await a.dispose(); await b.dispose()
})
