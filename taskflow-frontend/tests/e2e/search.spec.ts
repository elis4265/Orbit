import { test, expect, request } from '@playwright/test'
import { createVerifiedUser, loginUser, E2E_PASSWORD } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiPost(token: string, path: string, body: object) {
  const ctx = await request.newContext()
  try {
    const res = await ctx.post(`${API_URL}${path}`, {
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) throw new Error(`POST ${path} failed ${res.status()}: ${await res.text()}`)
    return res.json()
  } finally {
    await ctx.dispose()
  }
}

let token: string
let projectId: string
let boardId: string
let email: string

test.beforeAll(async () => {
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  email = `e2e-search-${uid}@test.com`
  token = await createVerifiedUser(email, `srch${uid}`)

  const project = await apiPost(token, '/projects', { name: 'Search E2E Project' }) as { id: string }
  projectId = project.id

  const boards = await (async () => {
    const ctx = await request.newContext()
    try {
      const res = await ctx.get(`${API_URL}/projects/${projectId}/boards`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.json() as Promise<{ id: string }[]>
    } finally {
      await ctx.dispose()
    }
  })()
  boardId = boards[0]?.id

  if (!boardId) {
    const board = await apiPost(token, `/projects/${projectId}/boards`, { name: 'Main' }) as { id: string }
    boardId = board.id
  }

  const taskTitles = [
    { title: 'Fix the login page',  description: 'Login button is broken on mobile',     status: 'todo' },
    { title: 'Design game UI',      description: 'Create mockups for the main game screen', status: 'in_progress' },
    { title: 'Write unit tests',    description: 'Cover the game engine with tests',      status: 'todo' },
    { title: 'Set up CI pipeline',  description: 'Configure GitHub Actions',              status: 'todo' },
    { title: 'Code review process', description: 'Document review guidelines',            status: 'todo' },
    { title: 'Database migration',  description: 'Migrate to PostgreSQL 16',              status: 'todo' },
    { title: 'API rate limiting',   description: 'Add slowapi middleware',                status: 'todo' },
    { title: 'User onboarding',     description: 'Build onboarding wizard',               status: 'todo' },
    { title: 'Billing integration', description: 'Integrate Stripe checkout',             status: 'todo' },
    { title: 'Analytics dashboard', description: 'Add usage metrics panel',               status: 'todo' },
  ]
  for (const t of taskTitles) {
    await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, t)
  }
})

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  const loginDone = page.waitForResponse((r) => r.url().includes('/auth/login') && r.status() === 200)
  await page.locator('button[type="submit"]').click()
  await loginDone
  await page.goto(`/projects/${projectId}`)
  await page.waitForURL(`**/projects/${projectId}`)
  await expect(page.locator('[aria-label="Search tasks"]')).toBeVisible({ timeout: 10000 })
})

test('search bar is visible on board page', async ({ page }) => {
  await expect(page.locator('[aria-label="Search tasks"]')).toBeVisible()
})

test('single character query shows no dropdown', async ({ page }) => {
  await page.locator('[aria-label="Search tasks"]').fill('f')
  await page.waitForTimeout(400)
  await expect(page.getByRole('listbox')).not.toBeVisible()
})

test('title match appears in dropdown', async ({ page }) => {
  await page.locator('[aria-label="Search tasks"]').fill('login')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('listbox')).toContainText('Fix the login page')
})

test('description match appears in dropdown', async ({ page }) => {
  await page.locator('[aria-label="Search tasks"]').fill('game')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  const listbox = page.getByRole('listbox')
  // "game" is in title of task 2 and description of task 3
  await expect(listbox).toContainText('Design game UI')
  await expect(listbox).toContainText('Write unit tests')
})

test('ticket number KEY-N lookup finds correct task', async ({ page }) => {
  // Get the project key first from the page (shown in results as KEY-N)
  await page.locator('[aria-label="Search tasks"]').fill('login')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  // Grab the ticket identifier (e.g. "ABC-1") from the first result
  const ticketLabel = await page.locator('[role="listbox"] [role="option"]').first().locator('span').first().textContent()
  await page.locator('[aria-label="Search tasks"]').fill('')

  if (ticketLabel) {
    await page.locator('[aria-label="Search tasks"]').fill(ticketLabel.trim())
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('listbox')).toContainText('Fix the login page')
  }
})

test('bare number lookup finds task by sequence number', async ({ page }) => {
  // sequence 10 = "Analytics dashboard" (10th task created); needs 2 chars to trigger search
  await page.locator('[aria-label="Search tasks"]').fill('10')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('listbox')).toContainText('Analytics dashboard')
})

test('clicking a result opens task detail modal', async ({ page }) => {
  await page.locator('[aria-label="Search tasks"]').fill('login')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  await page.getByRole('listbox').locator('[role="option"]').first().click()
  // TaskDetailModal should appear with the task title
  await expect(page.getByText('Fix the login page').first()).toBeVisible({ timeout: 5000 })
  // Search bar should be cleared
  await expect(page.locator('[aria-label="Search tasks"]')).toHaveValue('')
})

test('no results message shown for unmatched query', async ({ page }) => {
  await page.locator('[aria-label="Search tasks"]').fill('xyzxyzxyz')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('listbox')).toContainText('No results')
})

test('escape clears the search bar and closes dropdown', async ({ page }) => {
  await page.locator('[aria-label="Search tasks"]').fill('login')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('[aria-label="Search tasks"]')).toHaveValue('')
  await expect(page.getByRole('listbox')).not.toBeVisible()
})
