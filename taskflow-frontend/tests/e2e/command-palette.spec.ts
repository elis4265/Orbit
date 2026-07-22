/**
 * E2E for the Cmd-K command palette. Verifies it opens on Ctrl+K, fuzzy-filters
 * commands, runs a navigation command, and closes on Escape.
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { STATE_FILE } from './global-setup'

const TEST_EMAIL = process.env.E2E_EMAIL ?? 'e2e-board@test.com'
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Password123'

function boardWorkspaceId(): string {
  if (process.env.E2E_WORKSPACE_ID) return process.env.E2E_WORKSPACE_ID
  return JSON.parse(readFileSync(STATE_FILE, 'utf-8')).boardWorkspaceId
}

test.describe('Command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(TEST_EMAIL)
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    // Wait for login to persist the token + redirect before any direct navigation.
    await page.waitForURL(/\/projects\//, { timeout: 15000 })
    if (!page.url().includes(boardWorkspaceId())) {
      await page.goto(`/projects/${boardWorkspaceId()}`)
    }
    // The header (Search box) proves BoardPage mounted — the palette keybinding
    // lives here and works regardless of whether the board has any columns.
    await expect(page.getByPlaceholder('Search tasks…')).toBeVisible({ timeout: 15000 })
  })

  test('opens on Ctrl+K and filters commands', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder('Type a command or search tasks…')
    await expect(input).toBeVisible()
    await input.fill('members')
    await expect(page.getByRole('button', { name: 'Go to Members' })).toBeVisible()
  })

  test('running a navigation command navigates', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder('Type a command or search tasks…')
    await expect(input).toBeVisible()
    await input.fill('members')
    await input.press('Enter')   // top match is "Go to Members"
    await expect(page).toHaveURL(/\/members$/)
  })

  test('Escape closes the palette', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder('Type a command or search tasks…')
    await expect(input).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(input).not.toBeVisible()
  })
})
