/**
 * E2E for releases / roadmap (feature-gap #7). Covers the API CRUD + progress
 * rollup + ship, and the Roadmap view + release picker in the UI.
 */
import { test, expect, request as pr } from '@playwright/test'
import { createVerifiedUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

test.describe.configure({ mode: 'serial' })

test.describe('Releases & roadmap', () => {
  let token = ''
  let email = ''
  let pid = ''
  let bid = ''

  test.beforeAll(async () => {
    email = uniqueEmail('rel')
    token = await createVerifiedUser(email, `rel${Date.now()}`)
    const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
    pid = (await (await c.post(`${API}/projects`, { data: { name: 'Release E2E' } })).json()).id
    bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
    await c.dispose()
  })

  test('API: release CRUD + progress + ship round-trips', async () => {
    const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
    const rid = (await (await c.post(`${API}/projects/${pid}/releases`, { data: { name: 'v1.0', release_date: '2026-08-01' } })).json()).id

    const t1 = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'shipme' } })).json()
    const t2 = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'pending' } })).json()
    // assign both; mark one done (release_id parity + progress)
    await c.patch(`${API}/projects/${pid}/tasks/${t1.id}`, { data: { release_id: rid, status: 'done', version: t1.version } })
    await c.patch(`${API}/projects/${pid}/tasks/${t2.id}`, { data: { release_id: rid, version: t2.version } })

    const list = await (await c.get(`${API}/projects/${pid}/releases`)).json()
    expect(list[0].total_tasks).toBe(2)
    expect(list[0].done_tasks).toBe(1)
    expect(list[0].progress_pct).toBe(50)

    const ship = await (await c.post(`${API}/projects/${pid}/releases/${rid}/ship`)).json()
    expect(ship.status).toBe('released')
    expect(ship.incomplete_tasks).toBe(1)
    expect(ship.clean).toBe(false)
    await c.dispose()
  })

  test('UI: Roadmap view shows a release with its progress', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/projects\//, { timeout: 15000 })
    await page.goto(`/projects/${pid}`)
    await expect(page.getByPlaceholder('Search tasks…')).toBeVisible({ timeout: 15000 })

    await page.locator('button[aria-label="Roadmap view"]').click()
    await expect(page.getByText('v1.0')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('released')).toBeVisible()   // status badge from the API test
    await expect(page.getByText('50%')).toBeVisible()        // progress fill label
  })

  test('UI: a new release can be created from the roadmap', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(email)
    await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/projects\//, { timeout: 15000 })
    await page.goto(`/projects/${pid}`)
    await expect(page.getByPlaceholder('Search tasks…')).toBeVisible({ timeout: 15000 })

    await page.locator('button[aria-label="Roadmap view"]').click()
    await page.getByPlaceholder('New release (e.g. v1.2)').fill('v2.0')
    await page.getByRole('button', { name: 'Add release' }).click()
    await expect(page.getByText('v2.0')).toBeVisible({ timeout: 10000 })
  })
})
