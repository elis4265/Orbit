import { test, expect, request } from '@playwright/test'
import { createVerifiedUser, E2E_PASSWORD } from './global-setup'

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

async function apiGet(token: string, path: string) {
  const ctx = await request.newContext()
  try {
    const res = await ctx.get(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) throw new Error(`GET ${path} failed ${res.status()}`)
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
  email = `e2e-sprints-${uid}@test.com`
  token = await createVerifiedUser(email, `sprt${uid}`)

  const project = await apiPost(token, '/projects', { name: 'Sprint E2E Project' }) as { id: string }
  projectId = project.id

  const boards = await apiGet(token, `/projects/${projectId}/boards`) as { id: string }[]
  boardId = boards[0]?.id
  if (!boardId) {
    const board = await apiPost(token, `/projects/${projectId}/boards`, { name: 'Main' }) as { id: string }
    boardId = board.id
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
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
})

test('sprint button is visible in the toolbar', async ({ page }) => {
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible()
})

test('clicking sprint button opens the sprint panel', async ({ page }) => {
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.locator('[aria-label="Sprint panel"]')).toBeVisible({ timeout: 3000 })
})

test('sprint panel shows empty state when no sprints exist', async ({ page }) => {
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.locator('[aria-label="Sprint panel"]')).toBeVisible()
  await expect(page.getByText('No sprints yet')).toBeVisible()
})

test('sprint panel has a New Sprint button', async ({ page }) => {
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.locator('[aria-label="Sprint panel"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Sprint' })).toBeVisible()
})

test('clicking New Sprint shows the create form', async ({ page }) => {
  await page.locator('[aria-label="Manage sprints"]').click()
  await page.getByRole('button', { name: 'New Sprint' }).click()
  await expect(page.getByPlaceholder('Sprint name')).toBeVisible()
  await expect(page.locator('input[type="date"]').first()).toBeVisible()
})

test('creating a sprint shows it in the list as planned', async ({ page }) => {
  await page.locator('[aria-label="Manage sprints"]').click()
  await page.getByRole('button', { name: 'New Sprint' }).click()

  await page.getByPlaceholder('Sprint name').fill('Sprint 1')
  const [startDate, endDate] = page.locator('input[type="date"]').all()
  await (await startDate).fill('2026-07-01')
  await (await endDate).fill('2026-07-14')

  const createDone = page.waitForResponse((r) => r.url().includes('/sprints') && r.request().method() === 'POST' && r.status() === 201)
  await page.getByRole('button', { name: 'Create Sprint' }).click()
  await createDone

  await expect(page.getByText('Sprint 1')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('planned')).toBeVisible()
})

test('planned sprint has a delete button', async ({ page }) => {
  // Create a sprint via API so we start with one
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Delete Me',
    start_date: '2026-07-01',
    end_date: '2026-07-14',
  })

  await page.reload()
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.getByText('Delete Me')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('[aria-label="Delete sprint"]').first()).toBeVisible()
})

test('deleting a planned sprint removes it from the list', async ({ page }) => {
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Temporary Sprint',
    start_date: '2026-08-01',
    end_date: '2026-08-14',
  })

  await page.reload()
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.getByText('Temporary Sprint')).toBeVisible({ timeout: 5000 })

  const deleteDone = page.waitForResponse((r) => r.url().includes('/sprints/') && r.request().method() === 'DELETE' && r.status() === 204)
  await page.locator('[aria-label="Delete sprint"]').filter({ hasText: '' }).first().click()
  await deleteDone

  await expect(page.getByText('Temporary Sprint')).not.toBeVisible({ timeout: 5000 })
})

test('planned sprint shows Start Sprint button', async ({ page }) => {
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Ready Sprint',
    start_date: '2026-09-01',
    end_date: '2026-09-14',
  })

  await page.reload()
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.getByText('Ready Sprint')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('button', { name: 'Start Sprint' })).toBeVisible()
})

test('starting a sprint changes its status to active', async ({ page }) => {
  const sprintRes = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Start Me Sprint',
    start_date: '2026-10-01',
    end_date: '2026-10-14',
  }) as { id: string }

  await page.reload()
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.getByText('Start Me Sprint')).toBeVisible({ timeout: 5000 })

  const activateDone = page.waitForResponse((r) => r.url().includes('/activate') && r.status() === 200)
  await page.getByRole('button', { name: 'Start Sprint' }).click()
  await activateDone

  await expect(page.getByText('active')).toBeVisible({ timeout: 5000 })
})

test('active sprint shows Close Sprint button', async ({ page }) => {
  const sprintRes = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Active Sprint',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  }) as { id: string }

  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints/${sprintRes.id}/activate`, {})

  await page.reload()
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.getByText('Active Sprint')).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('button', { name: 'Close Sprint' })).toBeVisible()
})

test('closing an active sprint changes its status to closed', async ({ page }) => {
  const sprintRes = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Sprint to Close',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  }) as { id: string }

  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints/${sprintRes.id}/activate`, {})

  await page.reload()
  await expect(page.locator('[aria-label="Manage sprints"]')).toBeVisible({ timeout: 10000 })
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.getByText('Sprint to Close')).toBeVisible({ timeout: 5000 })

  const closeDone = page.waitForResponse((r) => r.url().includes('/close') && r.status() === 200)
  await page.getByRole('button', { name: 'Close Sprint' }).click()
  await closeDone

  await expect(page.getByText('closed')).toBeVisible({ timeout: 5000 })
})

test('sprint panel closes via X button', async ({ page }) => {
  await page.locator('[aria-label="Manage sprints"]').click()
  await expect(page.locator('[aria-label="Sprint panel"]')).toBeVisible()
  await page.locator('[aria-label="Close sprint panel"]').click()
  await expect(page.locator('[aria-label="Sprint panel"]')).not.toBeVisible({ timeout: 2000 })
})
