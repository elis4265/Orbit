import { test, expect, request as pwRequest } from '@playwright/test'
import { createVerifiedUser, createWorkspace, uniqueEmail, E2E_PASSWORD } from './global-setup'

test.describe.configure({ mode: 'serial' })

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function createBoard(token: string, workspaceId: string, name: string): Promise<string> {
  const ctx = await pwRequest.newContext()
  try {
    const res = await ctx.post(`${API_URL}/projects/${workspaceId}/boards`, {
      data: { name },
      headers: { Authorization: `Bearer ${token}` },
    })
    const board = await res.json() as { id: string }
    return board.id
  } finally {
    await ctx.dispose()
  }
}

async function createTask(token: string, workspaceId: string, boardId: string, title: string): Promise<string> {
  const ctx = await pwRequest.newContext()
  try {
    const res = await ctx.post(`${API_URL}/projects/${workspaceId}/boards/${boardId}/tasks`, {
      data: { title },
      headers: { Authorization: `Bearer ${token}` },
    })
    const task = await res.json() as { id: string }
    return task.id
  } finally {
    await ctx.dispose()
  }
}

test.describe('Comments [REQ-050–059]', () => {
  let ownerEmail: string
  let ownerToken: string
  let workspaceId: string
  let boardId: string
  let taskId: string

  test.beforeAll(async () => {
    ownerEmail = uniqueEmail('comment-owner')
    ownerToken = await createVerifiedUser(ownerEmail, `comment_owner_${Date.now()}`)
    workspaceId = await createWorkspace(ownerToken, 'Comment Test WS')
    boardId = await createBoard(ownerToken, workspaceId, 'Main Board')
    taskId = await createTask(ownerToken, workspaceId, boardId, 'Task with comments')
  })

  async function loginAndOpenTask(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(ownerEmail)
    await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/projects\//, { timeout: 15000 })
    await page.goto(`/projects/${workspaceId}`)
    await page.waitForURL(`**/projects/${workspaceId}`)
    // Click the task card to open detail modal
    await page.getByText('Task with comments').first().click()
    await expect(page.locator('[aria-label="Close"]').first()).toBeVisible({ timeout: 5000 })
  }

  test('[REQ-051] member can post a comment', async ({ page }) => {
    await loginAndOpenTask(page)
    const textarea = page.getByPlaceholder(/Add a comment/)
    await textarea.fill('First comment from E2E')
    await page.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText('First comment from E2E')).toBeVisible({ timeout: 5000 })
  })

  test('[REQ-050] comments shown oldest first', async ({ page }) => {
    await loginAndOpenTask(page)
    // Post a second comment
    await page.getByPlaceholder(/Add a comment/).fill('Second comment')
    await page.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText('Second comment')).toBeVisible({ timeout: 5000 })
    // First comment should appear before second
    const items = page.locator('.prose')
    const texts = await items.allTextContents()
    const firstIdx = texts.findIndex((t) => t.includes('First comment from E2E'))
    const secondIdx = texts.findIndex((t) => t.includes('Second comment'))
    expect(firstIdx).toBeLessThan(secondIdx)
  })

  test('[REQ-052] author can edit own comment', async ({ page }) => {
    await loginAndOpenTask(page)
    const firstComment = page.locator('.group').filter({ hasText: 'First comment from E2E' }).first()
    await firstComment.hover()
    await firstComment.getByLabel('Edit comment').click()
    const textarea = firstComment.getByRole('textbox')
    await textarea.fill('Edited comment text')
    await firstComment.getByText('Save').click()
    await expect(page.getByText('Edited comment text')).toBeVisible({ timeout: 5000 })
  })

  test('[REQ-054] edited indicator shown after edit', async ({ page }) => {
    await loginAndOpenTask(page)
    await expect(page.getByText('edited')).toBeVisible()
  })

  test('[REQ-059] edit history viewable', async ({ page }) => {
    await loginAndOpenTask(page)
    await page.getByText('edited').click()
    await expect(page.getByText('Edit history')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('First comment from E2E')).toBeVisible()
  })

  test('[REQ-053] author can delete own comment', async ({ page }) => {
    await loginAndOpenTask(page)
    const secondComment = page.locator('.group').filter({ hasText: 'Second comment' }).first()
    await secondComment.hover()
    await secondComment.getByLabel('Delete comment').click()
    await expect(page.getByText('Second comment')).not.toBeVisible({ timeout: 5000 })
  })

  test('[REQ-053] admin can delete another member comment', async ({ page }) => {
    // Create a member user who posts a comment
    const memberEmail = uniqueEmail('comment-member')
    const memberToken = await createVerifiedUser(memberEmail, `comment_member_${Date.now()}`)

    // Invite member to workspace
    const ctx = await pwRequest.newContext()
    const inviteRes = await ctx.post(`${API_URL}/projects/${workspaceId}/invites`, {
      data: { email: memberEmail },
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    const invite = await inviteRes.json() as { token: string }
    await ctx.post(`${API_URL}/invites/${invite.token}/accept`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    })

    // Member posts comment via API
    await ctx.post(`${API_URL}/projects/${workspaceId}/boards/${boardId}/tasks/${taskId}/comments`, {
      data: { content: 'Member-only comment to be deleted by admin' },
      headers: { Authorization: `Bearer ${memberToken}` },
    })
    await ctx.dispose()

    // Owner (admin) deletes it via UI
    await loginAndOpenTask(page)
    const memberComment = page.locator('.group').filter({ hasText: 'Member-only comment to be deleted by admin' }).first()
    await memberComment.hover()
    await memberComment.getByLabel('Delete comment').click()
    await expect(page.getByText('Member-only comment to be deleted by admin')).not.toBeVisible({ timeout: 5000 })
  })
})
