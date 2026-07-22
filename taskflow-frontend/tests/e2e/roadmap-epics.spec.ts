/**
 * E2E for the roadmap Epic lane — a dated epic appears on the roadmap timeline
 * with a children-progress bar.
 */
import { test, expect, request as pr } from '@playwright/test'
import { createVerifiedUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

test('roadmap shows a dated epic as its own lane', async ({ page }) => {
  const email = uniqueEmail('rmep')
  const token = await createVerifiedUser(email, `rmep${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Roadmap Epic E2E' } })).json()).id
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  // An epic with a due date so it lands on the timeline.
  const epic = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, {
    data: { title: 'Q3 Launch', issue_type: 'epic', due_date: '2026-09-15T00:00:00Z' },
  })).json()
  await c.dispose()

  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })
  await page.goto(`/projects/${pid}`)
  await expect(page.getByPlaceholder('Search tasks…')).toBeVisible({ timeout: 15000 })

  await page.locator('button[aria-label="Roadmap view"]').click()
  await expect(page.getByText('Epics')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(`${epic.project_key}-${epic.sequence_number} Q3 Launch`)).toBeVisible()
})
