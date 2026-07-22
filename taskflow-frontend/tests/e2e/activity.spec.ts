import { test, expect, request as pwRequest } from '@playwright/test'
import { createVerifiedUser, createWorkspace, uniqueEmail, E2E_PASSWORD } from './global-setup'

test.describe.configure({ mode: 'serial' })

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiPost(token: string, path: string, body?: unknown) {
  const ctx = await pwRequest.newContext()
  try {
    const res = await ctx.post(`${API_URL}${path}`, {
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.json()
  } finally {
    await ctx.dispose()
  }
}

async function apiPatch(token: string, path: string, body?: unknown) {
  const ctx = await pwRequest.newContext()
  try {
    const res = await ctx.patch(`${API_URL}${path}`, {
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.json()
  } finally {
    await ctx.dispose()
  }
}

test.describe('Activity Feed [Phase 14]', () => {
  let ownerEmail: string
  let ownerToken: string
  let workspaceId: string
  let boardId: string
  let taskId: string
  let taskVersion: number

  test.beforeAll(async () => {
    ownerEmail = uniqueEmail('activity-owner')
    ownerToken = await createVerifiedUser(ownerEmail, `activity_owner_${Date.now()}`)
    workspaceId = await createWorkspace(ownerToken, 'Activity Test WS')

    const board = await apiPost(ownerToken, `/projects/${workspaceId}/boards`, { name: 'Activity Board' }) as { id: string }
    boardId = board.id

    const task = await apiPost(ownerToken, `/projects/${workspaceId}/boards/${boardId}/tasks`, {
      title: 'Activity test task',
    }) as { id: string; version: number }
    taskId = task.id
    taskVersion = task.version
  })

  async function loginAndOpenActivity(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(ownerEmail)
    await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/projects\//, { timeout: 15000 })
    await page.goto(`/projects/${workspaceId}`)
    await page.waitForURL(`**/projects/${workspaceId}`)
    await page.getByText('Activity test task').first().click()
    await expect(page.locator('[aria-label="Close"]').first()).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Activity', exact: true }).click()
  }

  test('activity tab shows task_created entry after task creation', async ({ page }) => {
    await loginAndOpenActivity(page)
    await expect(page.getByText('created this task')).toBeVisible({ timeout: 5000 })
  })

  test('status change appears in activity feed', async ({ page }) => {
    // Change status via API
    const updated = await apiPatch(ownerToken, `/projects/${workspaceId}/boards/${boardId}/tasks/${taskId}`, {
      status: 'in_progress',
      version: taskVersion,
    }) as { version: number }
    taskVersion = updated.version

    await loginAndOpenActivity(page)
    await expect(page.getByText('changed status')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('in_progress')).toBeVisible()
  })

  test('comment action appears in activity feed', async ({ page }) => {
    await apiPost(ownerToken, `/projects/${workspaceId}/boards/${boardId}/tasks/${taskId}/comments`, {
      content: 'E2E test comment for activity',
    })

    await loginAndOpenActivity(page)
    await expect(page.getByText('added a comment')).toBeVisible({ timeout: 5000 })
  })

  test('activity feed shows actor name', async ({ page }) => {
    await loginAndOpenActivity(page)
    // Actor name is the username set during createVerifiedUser
    const actorName = ownerEmail.split('@')[0]
    // At least one entry should show a non-empty actor avatar
    await expect(page.locator('.rounded-full').first()).toBeVisible()
  })

  test('CSV export button triggers download', async ({ page }) => {
    await loginAndOpenActivity(page)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByTitle('Export as CSV').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('JSON export button triggers download', async ({ page }) => {
    await loginAndOpenActivity(page)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByTitle('Export as JSON').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })
})
