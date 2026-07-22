/**
 * E2E auth tests.
 * REQ-028 Sign Up Modal, REQ-041 Invite Registration Redirect,
 * REQ-042 Login with Invite Token.
 *
 * Uses real API — no mocks. Fresh users per describe block via /internal/test/create-user.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import {
  createVerifiedUser,
  createWorkspace,
  uniqueEmail,
  E2E_PASSWORD,
} from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

// Shared verified user for basic login tests (created once per run)
let authEmail: string

test.beforeAll(async () => {
  authEmail = uniqueEmail('auth')
  await createVerifiedUser(authEmail, `authusr${Date.now().toString(36)}`)
})

test.beforeEach(async ({ page }) => {
  // Navigate to any page on the origin first so localStorage ops work, then clear
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
})

// ─── Basic login-page tests ───────────────────────────────────────────────────

test('redirects unauthenticated user to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('shows login form', async ({ page }) => {
  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
})

// REQ-028 — Sign Up modal replaces old register tab
test('[REQ-028] clicking Sign up opens the SignUpModal', async ({ page }) => {
  await page.getByRole('button', { name: /sign up/i }).click()
  await expect(page.getByText('Sign Up for Orbit')).toBeVisible()
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
})

test('login with valid credentials stores access token', async ({ page }) => {
  await page.getByPlaceholder('Email').fill(authEmail)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  // Wait until we leave /login (may redirect to / or /projects/:id)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()
})

test('shows error on failed login', async ({ page }) => {
  await page.getByPlaceholder('Email').fill('nobody@nowhere.invalid')
  await page.getByPlaceholder('Password').fill('WrongPass123')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('.text-red-400')).toBeVisible()
})

// ─── REQ-041: Unauthenticated invite link redirects to registration ───────────

test.describe('[REQ-041] invite link redirects unauthenticated user to registration', () => {
  test('navigating to /invites/:token without session goes to /register?invite=...', async ({ page }) => {
    const ownerEmail = uniqueEmail('r041o')
    const ownerToken = await createVerifiedUser(ownerEmail, `r041o${Date.now().toString(36)}`)
    const wsId = await createWorkspace(ownerToken, 'REQ-041 WS')

    const inviteeEmail = uniqueEmail('r041inv')
    const ctx = await playwrightRequest.newContext()
    let inviteToken: string
    try {
      const res = await ctx.post(`${API_URL}/projects/${wsId}/invites`, {
        data: { email: inviteeEmail },
        headers: { Authorization: `Bearer ${ownerToken}` },
      })
      expect(res.ok()).toBe(true)
      const body = await res.json() as { token: string }
      inviteToken = body.token
    } finally {
      await ctx.dispose()
    }

    // Navigate unauthenticated to the invite link
    await page.goto(`/invites/${inviteToken}`)

    // AcceptInvitePage sees no user → redirects to /register?invite=...
    await expect(page).toHaveURL(new RegExp(`register.*invite=${inviteToken}`), { timeout: 10000 })

    // RegisterPage fetches invite metadata and shows workspace context
    await expect(page.getByText(/REQ-041 WS|Loading invite|Signing up as/i).first()).toBeVisible({
      timeout: 8000,
    })
  })
})

// ─── REQ-042: Login with invite token auto-accepts and redirects ──────────────

test.describe('[REQ-042] login with invite token auto-accepts and redirects to workspace', () => {
  test.describe.configure({ mode: 'serial' })

  let ownerToken: string
  let memberEmail: string
  let workspaceId: string
  let loginInviteToken: string

  test.beforeAll(async () => {
    const ownerEmail = uniqueEmail('r042o')
    ownerToken = await createVerifiedUser(ownerEmail, `r042o${Date.now().toString(36)}`)
    workspaceId = await createWorkspace(ownerToken, 'REQ-042 WS')

    memberEmail = uniqueEmail('r042m')
    await createVerifiedUser(memberEmail, `r042m${Date.now().toString(36)}`)

    const ctx = await playwrightRequest.newContext()
    try {
      const res = await ctx.post(`${API_URL}/projects/${workspaceId}/invites`, {
        data: { email: memberEmail },
        headers: { Authorization: `Bearer ${ownerToken}` },
      })
      expect(res.ok()).toBe(true)
      const body = await res.json() as { token: string }
      loginInviteToken = body.token
    } finally {
      await ctx.dispose()
    }
  })

  test('login with ?invite= param redirects to target workspace', async ({ page }) => {
    // LoginPage reads ?invite= param and calls memberApi.acceptInvite after login
    await page.goto(`/login?invite=${loginInviteToken}`)
    await page.getByPlaceholder('Email').fill(memberEmail)
    await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(new RegExp(`/projects/${workspaceId}`), { timeout: 15000 })
  })
})
