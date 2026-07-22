/**
 * E2E tests for workspace membership flows.
 * REQ-033 Invite Member, REQ-034 Accept Invite, REQ-035 List Members,
 * REQ-036 Remove Member, REQ-037 List Workspaces incl. Joined,
 * Phase 9 RBAC (admin/member/viewer roles, promote).
 *
 * Each describe block creates fresh users via /internal/test/create-user so runs
 * never collide. Serial mode lets tests share state without cleanup between steps.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { createVerifiedUser, createWorkspace, loginUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiPost(token: string, path: string, body: unknown) {
  const ctx = await playwrightRequest.newContext()
  try {
    const res = await ctx.post(`${API_URL}${path}`, {
      data: body as Record<string, unknown>,
      headers: { Authorization: `Bearer ${token}` },
    })
    return res
  } finally {
    await ctx.dispose()
  }
}

async function apiGet(token: string, path: string) {
  const ctx = await playwrightRequest.newContext()
  try {
    const res = await ctx.get(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res
  } finally {
    await ctx.dispose()
  }
}

/** Log into the browser as this user and navigate to the given URL. */
async function browserLogin(page: import('@playwright/test').Page, email: string, targetUrl: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })
  await page.goto(targetUrl)
}

// ─── REQ-033/034/035/036: invite → accept → list → remove ────────────────────

test.describe('Workspace membership flow', () => {
  test.describe.configure({ mode: 'serial' })

  let ownerEmail: string
  let ownerToken: string
  let memberEmail: string
  let workspaceId: string
  let inviteToken: string

  test.beforeAll(async () => {
    // Create fresh owner and workspace for this run
    ownerEmail = uniqueEmail('owner')
    ownerToken = await createVerifiedUser(ownerEmail, `owner${Date.now().toString(36)}`)
    workspaceId = await createWorkspace(ownerToken, 'Members Test WS')

    // Create fresh member user (unregistered — will accept via invite)
    memberEmail = uniqueEmail('member')
    await createVerifiedUser(memberEmail, `member${Date.now().toString(36)}`)
  })

  // REQ-033 — invite member by email via UI
  test('[REQ-033] owner sends invite via members page', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}/members`)
    await expect(page.getByPlaceholder('Invite by email')).toBeVisible({ timeout: 10000 })

    await page.getByPlaceholder('Invite by email').fill(memberEmail)
    await page.getByRole('button', { name: /send invite/i }).click()

    // No error message shown
    await expect(page.locator('.text-red-400')).not.toBeVisible()

    // Capture the token from the API for subsequent tests
    const inviteRes = await apiPost(ownerToken, `/projects/${workspaceId}/invites`, { email: memberEmail })
    // The invite above may fail with 409 (pending already) — that's fine, grab the token from DB via another invite attempt or use the first one
    const body = await inviteRes.json() as { token?: string; error?: { code?: string } }
    if (body.token) {
      inviteToken = body.token
    } else {
      // Already invited from UI — list pending invites isn't exposed, so create a second invite to a different email
      // and get the token for the member user from accepting test using the first invite sent by UI
      // The UI invite went through; we need the token. Use member login + accept flow instead.
      // Fall back: create invite via API for the accept test (second invite for same email gets 409)
      // We'll use the member's invite by having them try to register with invite token approach
      inviteToken = 'via-ui' // signal for accept test to use the API accept directly
    }
  })

  // REQ-034 — member accepts invite (via AcceptInvitePage UI)
  test('[REQ-034] member accepts invite and joins workspace', async ({ page }) => {
    // Get a fresh invite token for the accept test (create a new invite via API)
    const freshMemberEmail = uniqueEmail('acceptmember')
    await createVerifiedUser(freshMemberEmail, `acceptm${Date.now().toString(36)}`)

    const inviteRes = await apiPost(ownerToken, `/projects/${workspaceId}/invites`, { email: freshMemberEmail })
    expect(inviteRes.ok()).toBe(true)
    const { token } = await inviteRes.json() as { token: string }

    // Member logs in and navigates to the accept page
    await browserLogin(page, freshMemberEmail, `/invites/${token}`)

    // AcceptInvitePage: should redirect to the workspace on success
    await expect(page).toHaveURL(new RegExp(`/projects/${workspaceId}`), { timeout: 10000 })
  })

  // REQ-035 — list members includes owner + accepted members
  test('[REQ-035] members page lists owner and all accepted members', async ({ page }) => {
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}/members`)
    // Owner email always visible
    await expect(page.getByText(ownerEmail)).toBeVisible({ timeout: 10000 })
    // Members count label shows at least 2
    await expect(page.getByText(/Members \(/)).toBeVisible()
    const countText = await page.getByText(/Members \(/).textContent()
    const count = parseInt(countText?.match(/\d+/)?.[0] ?? '0', 10)
    expect(count).toBeGreaterThanOrEqual(2)
  })

  // REQ-036 — owner removes a member via UI
  test('[REQ-036] owner removes member via members page', async ({ page }) => {
    // Add a removable member first
    const removableEmail = uniqueEmail('removable')
    await createVerifiedUser(removableEmail, `rm${Date.now().toString(36)}`)
    const inviteRes = await apiPost(ownerToken, `/projects/${workspaceId}/invites`, { email: removableEmail })
    const { token } = await inviteRes.json() as { token: string }

    // Accept the invite via API (simulates the member clicking the link)
    const removableToken = await loginUser(removableEmail)
    const acceptRes = await apiPost(removableToken, `/invites/${token}/accept`, {})
    expect(acceptRes.ok()).toBe(true)

    // Owner opens members page and removes the member
    await browserLogin(page, ownerEmail, `/projects/${workspaceId}/members`)
    await expect(page.getByText(removableEmail)).toBeVisible({ timeout: 10000 })

    // Click remove button for this member (first click shows confirm)
    const removeBtn = page.getByRole('button', { name: new RegExp(`Remove ${removableEmail}`, 'i') })
    await removeBtn.click()
    // Confirm (check icon appears)
    await page.getByRole('button', { name: /confirm remove/i }).click()

    // Member row should disappear
    await expect(page.getByText(removableEmail)).not.toBeVisible({ timeout: 5000 })
  })
})

// ─── REQ-037: joined projects appear in workspace list ─────────────────────

test.describe('[REQ-037] joined projects visible in workspace list', () => {
  test('member sees joined workspace in selector', async ({ page }) => {
    const ownerEmail = uniqueEmail('ws37owner')
    const ownerToken = await createVerifiedUser(ownerEmail, `ws37o${Date.now().toString(36)}`)
    const wsId = await createWorkspace(ownerToken, 'Joined WS Test')

    const memberEmail = uniqueEmail('ws37member')
    const memberToken = await createVerifiedUser(memberEmail, `ws37m${Date.now().toString(36)}`)

    // Owner invites member
    const inviteRes = await apiPost(ownerToken, `/projects/${wsId}/invites`, { email: memberEmail })
    const { token } = await inviteRes.json() as { token: string }

    // Member accepts
    const acceptRes = await apiPost(memberToken, `/invites/${token}/accept`, {})
    expect(acceptRes.ok()).toBe(true)

    // Member logs in and should see the joined workspace
    await browserLogin(page, memberEmail, '/')
    await page.waitForURL(/\/projects\//, { timeout: 10000 })

    // The workspace selector should show "Joined WS Test"
    const wsRes = await apiGet(memberToken, '/projects')
    const projects = await wsRes.json() as { name: string }[]
    const names = projects.map((w) => w.name)
    expect(names).toContain('Joined WS Test')
  })
})

// ─── RBAC: role promotion and access control ─────────────────────────────────

test.describe('RBAC — role management', () => {
  test.describe.configure({ mode: 'serial' })

  let adminEmail: string
  let adminToken: string
  let memberEmail: string
  let memberToken: string
  let workspaceId: string

  test.beforeAll(async () => {
    adminEmail = uniqueEmail('rbacadmin')
    adminToken = await createVerifiedUser(adminEmail, `rbacadm${Date.now().toString(36)}`)
    workspaceId = await createWorkspace(adminToken, 'RBAC Test WS')

    memberEmail = uniqueEmail('rbacmember')
    memberToken = await createVerifiedUser(memberEmail, `rbacmem${Date.now().toString(36)}`)

    const inviteRes = await apiPost(adminToken, `/projects/${workspaceId}/invites`, { email: memberEmail })
    const { token } = await inviteRes.json() as { token: string }
    await apiPost(memberToken, `/invites/${token}/accept`, {})
  })

  test('admin sees invite form and role dropdowns', async ({ page }) => {
    await browserLogin(page, adminEmail, `/projects/${workspaceId}/members`)
    await expect(page.getByPlaceholder('Invite by email')).toBeVisible({ timeout: 10000 })
    // At least one role dropdown visible (for the member row)
    await expect(page.locator('select').first()).toBeVisible()
  })

  test('member does not see invite form or role dropdowns', async ({ page }) => {
    await browserLogin(page, memberEmail, `/projects/${workspaceId}/members`)
    await expect(page.getByText(adminEmail)).toBeVisible({ timeout: 10000 })
    await expect(page.getByPlaceholder('Invite by email')).not.toBeVisible()
    await expect(page.locator('select')).toHaveCount(0)
  })

  test('admin can promote member to admin via role dropdown', async ({ page }) => {
    await browserLogin(page, adminEmail, `/projects/${workspaceId}/members`)
    await expect(page.getByText(memberEmail)).toBeVisible({ timeout: 10000 })

    // Change the member's role dropdown to admin
    const selects = page.locator('select')
    await selects.first().selectOption('admin')

    // Verify via API that role actually changed
    await page.waitForTimeout(500) // let the mutation settle
    const membersRes = await apiGet(adminToken, `/projects/${workspaceId}/members`)
    const members = await membersRes.json() as { email: string; role: string }[]
    const updatedMember = members.find((m) => m.email === memberEmail)
    expect(updatedMember?.role).toBe('admin')
  })
})
