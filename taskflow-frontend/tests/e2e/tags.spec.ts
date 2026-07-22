/**
 * E2E tests for workspace tags (labels).
 * REQ-078 workspace-scoped tags, REQ-079 tag CRUD, REQ-080 apply/remove,
 * REQ-081 list tags, REQ-082 tag filter, REQ-083 TagPill contrast,
 * REQ-084 TagPicker, REQ-085 tags on TaskCard + TaskDetailModal.
 *
 * Serial mode — tests share workspace/board/task state created in beforeAll.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { createVerifiedUser, createWorkspace, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

interface ApiResult {
  ok: () => boolean
  status: () => number
  json: <T = unknown>() => T
  text: () => string
}

async function apiPost(token: string, path: string, body: unknown): Promise<ApiResult> {
  const ctx = await playwrightRequest.newContext()
  try {
    const res = await ctx.post(`${API_URL}${path}`, {
      data: body as Record<string, unknown>,
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = res.ok()
    const status = res.status()
    const text = await res.text()
    return { ok: () => ok, status: () => status, json: <T>() => JSON.parse(text) as T, text: () => text }
  } finally {
    await ctx.dispose()
  }
}

async function apiGet(token: string, path: string): Promise<ApiResult> {
  const ctx = await playwrightRequest.newContext()
  try {
    const res = await ctx.get(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ok = res.ok()
    const status = res.status()
    const text = await res.text()
    return { ok: () => ok, status: () => status, json: <T>() => JSON.parse(text) as T, text: () => text }
  } finally {
    await ctx.dispose()
  }
}

async function browserLogin(page: import('@playwright/test').Page, email: string, targetUrl: string) {
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })
  await page.goto(targetUrl)
}

test.describe('Tags (REQ-078–085)', () => {
  test.describe.configure({ mode: 'serial' })

  let ownerEmail: string
  let ownerToken: string
  let workspaceId: string
  let boardId: string
  let taskId: string
  let tagId: string

  test.beforeAll(async () => {
    ownerEmail = uniqueEmail('tags')
    ownerToken = await createVerifiedUser(ownerEmail, `tags${Date.now().toString(36)}`)
    workspaceId = await createWorkspace(ownerToken, 'Tags Test WS')

    // Create a board
    const boardRes = await apiPost(ownerToken, `/projects/${workspaceId}/boards`, { name: 'Tags Board' })
    const board = boardRes.json<{ id: string }>()
    boardId = board.id

    // Create a task
    const taskRes = await apiPost(ownerToken, `/projects/${workspaceId}/boards/${boardId}/tasks`, {
      title: 'Tag me task',
      status: 'todo',
      position: 0,
    })
    const task = taskRes.json<{ id: string }>()
    taskId = task.id
  })

  // ── REQ-079: Create tag via API ───────────────────────────────────────────

  test('[REQ-079] create tag via API returns tag with id and default color', async () => {
    const res = await apiPost(ownerToken, `/projects/${workspaceId}/tags`, {
      name: 'urgent',
      color: '#ef4444',
      visibility: 'workspace',
    })
    expect(res.ok()).toBe(true)
    const tag = res.json<{ id: string; name: string; color: string }>()
    expect(tag.name).toBe('urgent')
    expect(tag.color).toBe('#ef4444')
    tagId = tag.id
  })

  // ── REQ-081: List tags ────────────────────────────────────────────────────

  test('[REQ-081] GET /tags returns created tag', async () => {
    const res = await apiGet(ownerToken, `/projects/${workspaceId}/tags`)
    expect(res.ok()).toBe(true)
    const tags = res.json<{ id: string; name: string }[]>()
    expect(tags.some((t) => t.id === tagId)).toBe(true)
  })

  // ── REQ-080: Apply tag to task ────────────────────────────────────────────

  test('[REQ-080] apply tag to task via API', async () => {
    const res = await apiPost(ownerToken, `/projects/${workspaceId}/tasks/${taskId}/tags/${tagId}`, {})
    expect(res.status()).toBe(204)
  })

  // ── REQ-085: Tags on TaskCard ─────────────────────────────────────────────

  test('[REQ-085] tag pill visible on TaskCard after applying', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}`)
    await expect(page.getByText('Tag me task')).toBeVisible({ timeout: 10000 })

    // The tag pill should be visible on the card
    await expect(page.getByText('urgent')).toBeVisible({ timeout: 5000 })
  })

  // ── REQ-085: Tags in TaskDetailModal ─────────────────────────────────────

  test('[REQ-085] tag visible in TaskDetailModal Tags section', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}`)
    await page.getByText('Tag me task').click()
    // Wait for modal to open and the Tags section label to appear
    await expect(page.locator('.fixed.inset-0 p').filter({ hasText: /^Tags$/ })).toBeVisible({ timeout: 5000 })
    // The tag pill should appear in the Tags section of the detail modal
    await expect(page.locator('.fixed.inset-0').getByText('urgent')).toBeVisible({ timeout: 5000 })
  })

  // ── REQ-084: TagPicker creates tag inline ────────────────────────────────

  test('[REQ-084] TagPicker can create a new tag inline', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}`)
    await page.getByText('Tag me task').click()

    // Click the + button in the Tags section to open TagPicker (scoped to modal overlay)
    const modal = page.locator('.fixed.inset-0').last()
    await expect(modal.locator('p').filter({ hasText: /^Tags$/ })).toBeVisible({ timeout: 5000 })
    await modal.getByRole('button', { name: 'Tags', exact: true }).click()

    // Search input appears in the dropdown
    const searchInput = page.getByPlaceholder('Search tags…')
    await expect(searchInput).toBeVisible({ timeout: 3000 })

    // Click "Create new tag" to enter inline create mode
    await page.getByRole('button', { name: /create new tag/i }).click()

    // Fill in the new tag name
    const nameInput = page.getByPlaceholder('Tag name')
    await expect(nameInput).toBeVisible({ timeout: 3000 })
    await nameInput.fill('feature')
    await nameInput.press('Enter')

    // New tag pill should appear in the modal
    await expect(page.locator('.fixed.inset-0').getByText('feature')).toBeVisible({ timeout: 5000 })
  })

  // ── REQ-082: Tag filter on BoardPage ─────────────────────────────────────

  // FIXME: asserts the pre-SmartFilterBar filter UI ("filtered by" banner + remove-tag
  // button). The board now filters via the SmartFilterBar (@tag:urgent). Rewrite against
  // current behavior — tag apply/visibility is already covered by REQ-080/085 above.
  test.fixme('[REQ-082] clicking tag pill on TaskCard filters board to that tag', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}`)

    // Create a second task without the tag so we can verify filtering
    await apiPost(ownerToken, `/projects/${workspaceId}/boards/${boardId}/tasks`, {
      title: 'Untagged task',
      status: 'todo',
      position: 1,
    })
    await page.reload()
    await expect(page.getByText('Tag me task')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Untagged task')).toBeVisible({ timeout: 5000 })

    // Click the 'urgent' tag pill on the tagged task card to activate the filter
    await page.getByText('urgent').first().click()

    // Filter bar should appear
    await expect(page.getByText(/filtered by/i)).toBeVisible({ timeout: 3000 })

    // Untagged task should no longer be visible in columns
    await expect(page.getByText('Untagged task')).not.toBeVisible({ timeout: 3000 })

    // Tagged task should still be visible
    await expect(page.getByText('Tag me task')).toBeVisible()
  })

  // ── REQ-082: Remove filter ────────────────────────────────────────────────

  test.fixme('[REQ-082] removing the filter restores all tasks', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}`)
    await page.reload()
    await expect(page.getByText('Tag me task')).toBeVisible({ timeout: 10000 })

    // Activate filter first
    await page.getByText('urgent').first().click()
    await expect(page.getByText(/filtered by/i)).toBeVisible({ timeout: 3000 })

    // Click × on the filter pill to remove it (TagPill renders aria-label="Remove tag <name>")
    await page.getByRole('button', { name: /remove tag/i }).click()

    // Both tasks visible again
    await expect(page.getByText('Untagged task')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Tag me task')).toBeVisible()
  })

  // ── REQ-080: Remove tag from task via API ────────────────────────────────

  test('[REQ-080] remove tag from task via API', async () => {
    const ctx = await playwrightRequest.newContext()
    let ok = false
    try {
      const res = await ctx.delete(
        `${API_URL}/projects/${workspaceId}/tasks/${taskId}/tags/${tagId}`,
        { headers: { Authorization: `Bearer ${ownerToken}` } },
      )
      ok = res.ok()
    } finally {
      await ctx.dispose()
    }
    expect(ok).toBe(true)

    // Verify tag no longer on task
    const taskTagsRes = await apiGet(ownerToken, `/projects/${workspaceId}/tasks/${taskId}/tags`)
    const taskTags = taskTagsRes.json<{ id: string }[]>()
    expect(taskTags.every((t) => t.id !== tagId)).toBe(true)
  })

  // ── REQ-078: Private tag not visible to other members ────────────────────

  test('[REQ-078] private tag not visible to other workspace members', async () => {
    // Create a private tag
    const privateRes = await apiPost(ownerToken, `/projects/${workspaceId}/tags`, {
      name: 'private-secret',
      visibility: 'private',
    })
    expect(privateRes.ok()).toBe(true)

    // Invite a member
    const memberEmail = uniqueEmail('tagmember')
    const memberToken = await createVerifiedUser(memberEmail, `tagm${Date.now().toString(36)}`)
    const inviteRes = await apiPost(ownerToken, `/projects/${workspaceId}/invites`, { email: memberEmail })
    const { token } = inviteRes.json<{ token: string }>()
    await apiPost(memberToken, `/invites/${token}/accept`, {})

    // Member's tag list should NOT contain the private tag
    const memberTagsRes = await apiGet(memberToken, `/projects/${workspaceId}/tags`)
    const memberTags = memberTagsRes.json<{ name: string }[]>()
    expect(memberTags.every((t) => t.name !== 'private-secret')).toBe(true)

    // Owner CAN see it
    const ownerTagsRes = await apiGet(ownerToken, `/projects/${workspaceId}/tags`)
    const ownerTags = ownerTagsRes.json<{ name: string }[]>()
    expect(ownerTags.some((t) => t.name === 'private-secret')).toBe(true)
  })
})
