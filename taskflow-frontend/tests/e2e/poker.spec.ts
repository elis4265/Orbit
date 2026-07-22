/**
 * E2E for planning poker — exercises the FULL real-time stack end to end:
 * browser → nginx WS upgrade (/api/v1/ws/) → FastAPI ws_project → broadcast back.
 * Guards the bug where the WS URL/decorator/nginx route killed the project socket
 * (poker showed "0 voted" forever).
 */
import { test, expect, request as pr } from '@playwright/test'
import { createVerifiedUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

test('planning poker: vote registers over the project socket', async ({ page }) => {
  // ── API setup: story-points project + a task to estimate ──
  const email = uniqueEmail('poker')
  const token = await createVerifiedUser(email, `poker${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Poker E2E' } })).json()).id
  await c.patch(`${API}/projects/${pid}/estimation-method`, { data: { estimation_method: 'story_points' } })
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  const tid = (await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'estimate me' } })).json()).id
  await c.dispose()

  // ── UI: open the task, run a poker round ──
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })
  await page.goto(`/projects/${pid}?task=${tid}`)

  await expect(page.getByText('Story Points')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1200)                 // let the project socket connect + auth
  await page.getByText('Estimate together').click()
  await expect(page.getByText('Planning poker')).toBeVisible()

  // The poker cards are the SECOND Fibonacci row (after the SP presets) → .last()
  await page.getByRole('button', { name: '5', exact: true }).last().click()

  // The vote must round-trip the socket and reflect back.
  await expect(page.getByText(/1 voted/)).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: 'Reveal' }).click()
  await expect(page.getByText(/avg ~5/)).toBeVisible({ timeout: 5000 })
})
