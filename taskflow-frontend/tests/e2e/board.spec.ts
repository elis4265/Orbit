import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { STATE_FILE } from './global-setup'

const TEST_EMAIL = process.env.E2E_EMAIL ?? 'e2e-board@test.com'
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Password123'

function getBoardWorkspaceId(): string {
  if (process.env.E2E_WORKSPACE_ID) return process.env.E2E_WORKSPACE_ID
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8')).boardWorkspaceId
}

test.describe('Board', () => {
  test.beforeEach(async ({ page }) => {
    const workspaceId = getBoardWorkspaceId()
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(TEST_EMAIL)
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    // Wait for login to complete then navigate directly to the target workspace
    await page.waitForURL(/\/projects\//, { timeout: 15000 })
    if (!page.url().includes(workspaceId)) {
      await page.goto(`/projects/${workspaceId}`)
      await page.waitForURL(`**/projects/${workspaceId}`)
    }
  })

  test('shows kanban columns', async ({ page }) => {
    await expect(page.getByText('To Do')).toBeVisible()
    await expect(page.getByText('In Progress')).toBeVisible()
    await expect(page.getByText('Done')).toBeVisible()
  })

  test('opens create task modal', async ({ page }) => {
    await page.locator('button[aria-label="Add task to To Do"]').click()
    await expect(page.getByPlaceholder('Task title')).toBeVisible()
  })

  test('creates a task', async ({ page }) => {
    await page.locator('button[aria-label="Add task to To Do"]').click()
    await page.getByPlaceholder('Task title').fill('New test task')
    await page.getByRole('button', { name: 'Create task' }).click()
    await expect(page.getByText('New test task')).toBeVisible()
  })

  test('workspace selector is visible', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: /workspace/i }).first()).toBeVisible()
  })

  test.describe.configure({ mode: 'serial' })
  test.describe('Description editor — list formatting', () => {
    test.beforeEach(async ({ page }, testInfo) => {
      // Columns finish loading after async board + task fetches
      await expect(page.locator('button[aria-label="Add task to To Do"]')).toBeVisible({ timeout: 15000 })
      const title = `list-test-${testInfo.testId.slice(-6)}`
      await page.locator('button[aria-label="Add task to To Do"]').click()
      await page.getByPlaceholder('Task title').fill(title)
      await page.getByRole('button', { name: 'Create task' }).click()
      await page.getByText(title).first().click()
      // Open description editor
      await page.locator('text=Add a description…').click()
      await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 10000 })
    })

    test('bullet list button wraps content in <ul>', async ({ page }) => {
      await page.locator('.ProseMirror').type('First item')
      await page.getByTitle('Bullet list').click()
      const html = await page.locator('.ProseMirror').innerHTML()
      expect(html).toContain('<ul')
      expect(html).toContain('<li')
    })

    test('ordered list button wraps content in <ol>', async ({ page }) => {
      await page.locator('.ProseMirror').type('First item')
      await page.getByTitle('Ordered list').click()
      const html = await page.locator('.ProseMirror').innerHTML()
      expect(html).toContain('<ol')
      expect(html).toContain('<li')
    })

    test('bullet list renders multiple items on Enter', async ({ page }) => {
      const editor = page.locator('.ProseMirror')
      await page.getByTitle('Bullet list').click()
      await editor.type('Item one')
      await editor.press('Enter')
      await editor.type('Item two')
      const items = page.locator('.ProseMirror ul li')
      await expect(items).toHaveCount(2)
    })

    test('ordered list renders multiple items on Enter', async ({ page }) => {
      const editor = page.locator('.ProseMirror')
      await page.getByTitle('Ordered list').click()
      await editor.type('Item one')
      await editor.press('Enter')
      await editor.type('Item two')
      const items = page.locator('.ProseMirror ol li')
      await expect(items).toHaveCount(2)
    })
  })
})
