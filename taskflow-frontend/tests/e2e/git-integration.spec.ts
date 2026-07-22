/**
 * E2E for Git integration (feature-gap #5). Admin connects a repository in
 * Project Settings → Integrations; the webhook URL + secret are shown, and a
 * synthetic signed GitHub webhook then drives the task (links + transition).
 */
import { test, expect, request as pr } from '@playwright/test'
import { createHmac } from 'crypto'
import { createVerifiedUser, uniqueEmail, E2E_PASSWORD } from './global-setup'

const API = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

test('connect a repo, then a signed webhook links + transitions a task', async ({ page }) => {
  const email = uniqueEmail('git')
  const token = await createVerifiedUser(email, `git${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Git E2E' } })).json()).id
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  const proj = await (await c.get(`${API}/projects`)).json()
  const key: string = proj.find((p: { id: string }) => p.id === pid).key
  const task = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'wire it up' } })).json()
  const ref = `${key}-${task.sequence_number}`

  // ── connect a GitHub repo via the Settings UI ──
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/projects\//, { timeout: 15000 })

  await page.goto(`/projects/${pid}/settings`)
  await page.getByRole('button', { name: 'Integrations' }).click()
  await page.getByLabel('Repository').fill('o/r')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('connect-next-steps')).toBeVisible({ timeout: 10000 })

  // ── grab the connection + secret over the API, fire a signed PR-opened webhook ──
  const conn = (await (await c.get(`${API}/projects/${pid}/vcs-connections`)).json())[0]
  const created = await (await c.post(`${API}/projects/${pid}/vcs-connections`, {
    data: { provider: 'github', repo_identifier: 'o/r2' },
  })).json()
  const secret: string = created.webhook_secret
  const body = JSON.stringify({
    action: 'opened',
    pull_request: {
      id: 1, number: 9, title: `Fix ${ref}`, body: '', merged: false,
      html_url: 'https://github.com/o/r/pull/9', head: { ref: 'feat/x' }, user: { login: 'octocat' },
    },
  })
  const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  const res = await c.post(`${API}/vcs/github/webhook/${created.id}`, {
    headers: {
      'X-GitHub-Event': 'pull_request',
      'X-GitHub-Delivery': `${Date.now()}`,
      'X-Hub-Signature-256': sig,
      'Content-Type': 'application/json',
    },
    data: body,
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).linked).toBe(1)

  // the task moved to in_progress and shows a dev link
  const tasks = await (await c.get(`${API}/projects/${pid}/boards/${bid}/tasks`)).json()
  expect(tasks.find((t: { id: string }) => t.id === task.id).status).toBe('in_progress')
  const links = await (await c.get(`${API}/projects/${pid}/tasks/${task.id}/dev-links`)).json()
  expect(links.length).toBe(1)
  expect(conn.provider).toBe('github')
})


test('enforced (Jira) rule closes a multi-repo task only when all PRs merge', async () => {
  const email = uniqueEmail('gitj')
  const token = await createVerifiedUser(email, `gitj${Date.now()}`)
  const c = await pr.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  const pid = (await (await c.post(`${API}/projects`, { data: { name: 'Git Jira E2E' } })).json()).id
  const bid = (await (await c.post(`${API}/projects/${pid}/boards`, { data: { name: 'Main' } })).json()).id
  await c.patch(`${API}/projects/${pid}/mode`, { data: { mode: 'enforced' } })
  const key: string = (await (await c.get(`${API}/projects`)).json()).find((p: { id: string }) => p.id === pid).key

  // the multi-repo close-gate as an authored rule (comment action keeps it transition-rule-agnostic)
  await c.post(`${API}/projects/${pid}/automation-rules`, {
    data: {
      name: 'close when all merged', trigger: 'pr_merged',
      conditions: [{ field: 'open_prs', op: 'is_empty' }],
      actions: [{ type: 'comment', text: 'all repos merged' }],
    },
  })

  // two repos → two connections
  const mk = async (repo: string) =>
    (await (await c.post(`${API}/projects/${pid}/vcs-connections`, { data: { provider: 'github', repo_identifier: repo } })).json())
  const a = await mk('o/main')
  const b = await mk('o/libs')
  const task = await (await c.post(`${API}/projects/${pid}/boards/${bid}/tasks`, { data: { title: 'span' } })).json()
  const ref = `${key}-${task.sequence_number}`

  const fire = async (conn: { id: string; webhook_secret: string }, action: string, prId: number, merged: boolean) => {
    const body = JSON.stringify({
      action, pull_request: {
        id: prId, number: prId, title: `Fix ${ref}`, body: '', merged,
        html_url: `https://github.com/o/r/pull/${prId}`, head: { ref: 'feat/x' }, user: { login: 'dev' },
      },
    })
    const sig = 'sha256=' + createHmac('sha256', conn.webhook_secret).update(body).digest('hex')
    return c.post(`${API}/vcs/github/webhook/${conn.id}`, {
      headers: { 'X-GitHub-Event': 'pull_request', 'X-GitHub-Delivery': `${prId}-${action}-${merged}`, 'X-Hub-Signature-256': sig, 'Content-Type': 'application/json' },
      data: body,
    })
  }

  await fire(a, 'opened', 1, false)
  await fire(b, 'opened', 2, false)
  const r1 = await (await fire(a, 'closed', 1, true)).json()   // libs PR still open
  const r2 = await (await fire(b, 'closed', 2, true)).json()   // all merged
  expect(r1.rules).toBe(0)
  expect(r2.rules).toBe(1)

  const comments = await (await c.get(`${API}/projects/${pid}/tasks/${task.id}/comments`)).json()
  expect(comments.filter((x: { content: string }) => x.content === 'all repos merged').length).toBe(1)
})
