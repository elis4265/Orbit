/**
 * E2E for the Enforced release ship-gate. Shipping a release with unfinished
 * tasks can keep / backlog / move them; in Enforced mode the UI prompts first.
 */
import { test, expect, request as pr } from '@playwright/test'
import { createVerifiedUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

test('ship with backlog disposition reassigns unfinished tasks off the release', async () => {
  const token = await createVerifiedUser(uniqueEmail('shipg'), `shipg${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Ship Gate API' } })).json()).id
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  const rid = (await (await c.post(`${API}/projects/${pid}/releases`, { data: { name: 'v1.0', release_date: '2026-08-01' } })).json()).id

  const done = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'done one' } })).json()
  const open = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'still open' } })).json()
  await c.patch(`${API}/projects/${pid}/tasks/${done.id}`, { data: { release_id: rid, status: 'done', version: done.version } })
  await c.patch(`${API}/projects/${pid}/tasks/${open.id}`, { data: { release_id: rid, version: open.version } })

  const ship = await (await c.post(`${API}/projects/${pid}/releases/${rid}/ship`, { data: { unfinished_action: 'backlog' } })).json()
  expect(ship.status).toBe('released')
  expect(ship.incomplete_tasks).toBe(1)   // reported what it handled

  // The unfinished task was moved to the backlog (release_id cleared); the done one stays.
  const tasks = await (await c.get(`${API}/projects/${pid}/boards/${bid}/tasks`)).json()
  const openAfter = tasks.find((t: { id: string }) => t.id === open.id)
  const doneAfter = tasks.find((t: { id: string }) => t.id === done.id)
  expect(openAfter.release_id).toBeNull()
  expect(doneAfter.release_id).toBe(rid)
  await c.dispose()
})

test('Enforced mode prompts a decision before shipping with unfinished work', async ({ page }) => {
  const email = uniqueEmail('shipgui')
  const token = await createVerifiedUser(email, `shipgui${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Ship Gate UI' } })).json()).id
  await c.patch(`${API}/projects/${pid}/mode`, { data: { mode: 'enforced' } })
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  const rid = (await (await c.post(`${API}/projects/${pid}/releases`, { data: { name: 'v2.0', release_date: '2026-08-01' } })).json()).id
  const t = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'unfinished' } })).json()
  await c.patch(`${API}/projects/${pid}/tasks/${t.id}`, { data: { release_id: rid, version: t.version } })
  await c.dispose()

  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })
  await page.goto(`/projects/${pid}`)
  await expect(page.getByPlaceholder('Search tasks…')).toBeVisible({ timeout: 15000 })

  await page.locator('button[aria-label="Roadmap view"]').click()
  await page.getByText('v2.0').hover()
  await page.locator('button[title="Mark released"]').first().click()
  // The gate appears instead of shipping immediately.
  await expect(page.getByText(/aren't done/)).toBeVisible({ timeout: 5000 })
  await page.getByText('Send them to the backlog').click()
  await page.getByRole('button', { name: 'Release', exact: true }).click()
  await expect(page.getByText('released')).toBeVisible({ timeout: 5000 })
})
