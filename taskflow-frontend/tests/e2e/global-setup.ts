import { request } from '@playwright/test'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const STATE_FILE = path.join(__dirname, '.e2e-state.json')

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'
export const E2E_PASSWORD = 'Password123'

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`
}

/** Create a verified user via the dev-only internal endpoint.
 * Superuser by default: most specs create their own project (HW-37 made
 * creation superuser-only); pass false for a plain member/viewer persona. */
export async function createVerifiedUser(
  email: string,
  username: string,
  password = E2E_PASSWORD,
  isSuperuser = true,
): Promise<string> {
  const ctx = await request.newContext()
  try {
    const res = await ctx.post(`${API_URL}/internal/test/create-user`, {
      data: { email, password, username, is_superuser: isSuperuser },
    })
    if (!res.ok()) throw new Error(`create-user failed ${res.status()}: ${await res.text()}`)
    const { access_token } = await res.json() as { access_token: string }
    return access_token
  } finally {
    await ctx.dispose()
  }
}

/** Login and return access token. */
export async function loginUser(email: string, password = E2E_PASSWORD): Promise<string> {
  const ctx = await request.newContext()
  try {
    const res = await ctx.post(`${API_URL}/auth/login`, {
      data: new URLSearchParams({ username: email, password }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!res.ok()) throw new Error(`login failed ${res.status()}`)
    const { access_token } = await res.json() as { access_token: string }
    return access_token
  } finally {
    await ctx.dispose()
  }
}

/** Create a project and return its id. */
export async function createWorkspace(token: string, name: string): Promise<string> {
  const ctx = await request.newContext()
  try {
    const res = await ctx.post(`${API_URL}/projects`, {
      data: { name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) throw new Error(`createWorkspace failed ${res.status()}`)
    const ws = await res.json() as { id: string }
    return ws.id
  } finally {
    await ctx.dispose()
  }
}

/**
 * Ensure the persistent board-test user exists (login first, create if login fails).
 * This user persists across runs so board.spec.ts doesn't hit the rate limit on register.
 */
async function ensureBoardUser(): Promise<{ email: string; token: string }> {
  const email = 'e2e-board@test.com'
  const username = 'e2eboard'
  try {
    const token = await loginUser(email)
    return { email, token }
  } catch {
    const token = await createVerifiedUser(email, username)
    return { email, token }
  }
}

export default async function globalSetup() {
  const { email: boardEmail, token: boardToken } = await ensureBoardUser()

  // Reuse first workspace if it exists, otherwise create one
  const ctx = await request.newContext()
  let boardWorkspaceId: string
  try {
    const res = await ctx.get(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${boardToken}` },
    })
    const workspaces = await res.json() as { id: string }[]
    boardWorkspaceId = workspaces.length > 0
      ? workspaces[0].id
      : await createWorkspace(boardToken, 'E2E Board Workspace')
  } finally {
    await ctx.dispose()
  }

  writeFileSync(STATE_FILE, JSON.stringify({
    boardWorkspaceId,
    boardEmail,
    boardPassword: E2E_PASSWORD,
  }), 'utf-8')
}
