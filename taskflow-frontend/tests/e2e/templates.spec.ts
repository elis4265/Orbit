/**
 * E2E for issue templates (feature-gap #8). A template prefills the create-task
 * form and its defaults (type, severity, tags) carry through to the new task.
 */
import { test, expect, request as pr } from '@playwright/test'
import { createVerifiedUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

test('template prefills the create modal and applies its defaults', async ({ page }) => {
  const email = uniqueEmail('tpl')
  const token = await createVerifiedUser(email, `tpl${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Template E2E' } })).json()).id
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  const tag = await (await c.post(`${API}/projects/${pid}/tags`, { data: { name: 'triage', color: '#ff8800' } })).json()
  await c.post(`${API}/projects/${pid}/task-templates`, {
    data: { name: 'Bug report', title: '[BUG] ', description: 'Steps to reproduce', issue_type: 'bug', severity: 'high', tag_ids: [tag.id] },
  })

  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('button[aria-label="Add task to To Do"]')).toBeVisible({ timeout: 15000 })

  // Open the create modal, pick the template → title prefills.
  await page.locator('button[aria-label="Add task to To Do"]').click()
  await page.getByLabel('Apply template').selectOption({ label: 'Bug report' })
  await expect(page.getByPlaceholder('Task title')).toHaveValue('[BUG] ')

  // Finish the title and create.
  const title = `[BUG] login broken ${Date.now()}`
  await page.getByPlaceholder('Task title').fill(title)
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText(title)).toBeVisible({ timeout: 10000 })

  // The template's defaults carried through. Tags are applied post-create
  // (a second request after the task exists), so poll until it lands.
  async function fetchMade() {
    const tasks = await (await c.get(`${API}/projects/${pid}/boards/${bid}/tasks`)).json()
    return tasks.find((t: { title: string }) => t.title === title)
  }
  await expect.poll(async () => (await fetchMade())?.tags?.map((t: { name: string }) => t.name) ?? [], { timeout: 8000 })
    .toContain('triage')

  const made = await fetchMade()
  expect(made.issue_type).toBe('bug')
  expect(made.severity).toBe('high')
  await c.dispose()
})
