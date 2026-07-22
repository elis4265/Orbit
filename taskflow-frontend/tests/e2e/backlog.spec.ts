import { test, expect, request } from '@playwright/test'
import { createVerifiedUser, E2E_PASSWORD } from './global-setup'

const API_URL = (process.env.API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiPost(token: string, path: string, body: object) {
  const ctx = await request.newContext()
  try {
    const res = await ctx.post(`${API_URL}${path}`, {
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) throw new Error(`POST ${path} failed ${res.status()}: ${await res.text()}`)
    return res.json()
  } finally {
    await ctx.dispose()
  }
}

async function apiGet(token: string, path: string) {
  const ctx = await request.newContext()
  try {
    const res = await ctx.get(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) throw new Error(`GET ${path} failed ${res.status()}`)
    return res.json()
  } finally {
    await ctx.dispose()
  }
}

async function apiPatch(token: string, path: string, body: object) {
  const ctx = await request.newContext()
  try {
    const res = await ctx.patch(`${API_URL}${path}`, {
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) throw new Error(`PATCH ${path} failed ${res.status()}: ${await res.text()}`)
    return res.json()
  } finally {
    await ctx.dispose()
  }
}

let token: string
let projectId: string
let boardId: string
let email: string

test.beforeAll(async () => {
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  email = `e2e-backlog-${uid}@test.com`
  token = await createVerifiedUser(email, `bklg${uid}`)

  const project = await apiPost(token, '/projects', { name: 'Backlog E2E Project' }) as { id: string }
  projectId = project.id

  const boards = await apiGet(token, `/projects/${projectId}/boards`) as { id: string }[]
  boardId = boards[0]?.id
  if (!boardId) {
    const board = await apiPost(token, `/projects/${projectId}/boards`, { name: 'Main' }) as { id: string }
    boardId = board.id
  }
})

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(E2E_PASSWORD)
  const loginDone = page.waitForResponse((r) => r.url().includes('/auth/login') && r.status() === 200)
  await page.locator('button[type="submit"]').click()
  await loginDone
  await page.goto(`/projects/${projectId}`)
  await page.waitForURL(`**/projects/${projectId}`)
  await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
})

// ── Backend API tests ──────────────────────────────────────────────────────────

test('GET /projects/{id}/tasks returns all tasks', async () => {
  const ctx = await request.newContext()
  // Create two tasks via board endpoint
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, { title: 'Task A', status: 'todo' })
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, { title: 'Task B', status: 'todo' })

  try {
    const res = await ctx.get(`${API_URL}/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const tasks = await res.json() as { title: string }[]
    const titles = tasks.map((t) => t.title)
    expect(titles).toContain('Task A')
    expect(titles).toContain('Task B')
  } finally {
    await ctx.dispose()
  }
})

test('GET /projects/{id}/tasks?sprint_id=none returns only tasks without sprint', async () => {
  const ctx = await request.newContext()

  // Create a sprint and a task assigned to it
  const sprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Sprint for filter test',
    start_date: '2026-07-01',
    end_date: '2026-07-14',
  }) as { id: string }

  const taskWithSprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, {
    title: 'Sprint Task',
    status: 'todo',
  }) as { id: string; version: number }

  await apiPatch(token, `/projects/${projectId}/boards/${boardId}/tasks/${taskWithSprint.id}`, {
    sprint_id: sprint.id,
    version: taskWithSprint.version,
  })

  const taskWithoutSprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, {
    title: 'Backlog Task Unique',
    status: 'todo',
  }) as { id: string }

  try {
    const res = await ctx.get(`${API_URL}/projects/${projectId}/tasks?sprint_id=none`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const tasks = await res.json() as { id: string; sprint_id: string | null }[]
    expect(tasks.every((t) => t.sprint_id === null)).toBeTruthy()
    expect(tasks.some((t) => t.id === taskWithoutSprint.id)).toBeTruthy()
    expect(tasks.some((t) => t.id === taskWithSprint.id)).toBeFalsy()
  } finally {
    await ctx.dispose()
  }
})

test('GET /projects/{id}/tasks?sprint_id={id} returns only tasks in that sprint', async () => {
  const ctx = await request.newContext()

  const sprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Sprint for ID filter',
    start_date: '2026-08-01',
    end_date: '2026-08-14',
  }) as { id: string }

  const taskInSprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, {
    title: 'Filtered Sprint Task',
    status: 'todo',
  }) as { id: string; version: number }

  await apiPatch(token, `/projects/${projectId}/boards/${boardId}/tasks/${taskInSprint.id}`, {
    sprint_id: sprint.id,
    version: taskInSprint.version,
  })

  try {
    const res = await ctx.get(`${API_URL}/projects/${projectId}/tasks?sprint_id=${sprint.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const tasks = await res.json() as { id: string; sprint_id: string }[]
    expect(tasks.every((t) => t.sprint_id === sprint.id)).toBeTruthy()
    expect(tasks.some((t) => t.id === taskInSprint.id)).toBeTruthy()
  } finally {
    await ctx.dispose()
  }
})

// ── UI: Backlog tab ────────────────────────────────────────────────────────────

test('Backlog tab is visible in the tab bar', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Backlog' })).toBeVisible()
})

test('Active Sprint tab is not visible when no sprint is active', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Active Sprint' })).not.toBeVisible()
})

test('clicking Backlog tab selects it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Backlog' }).click()
  await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('aria-selected', 'true')
})

test('Backlog tab shows tasks without a sprint', async ({ page }) => {
  // Seed via API
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, {
    title: 'Backlog Visible Task',
    status: 'todo',
  })

  await page.reload()
  await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
  await page.getByRole('tab', { name: 'Backlog' }).click()

  await expect(page.getByText('Backlog Visible Task')).toBeVisible({ timeout: 5000 })
})

test('Backlog tab does not show tasks assigned to a sprint', async ({ page }) => {
  const sprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Sprint hide test',
    start_date: '2026-09-01',
    end_date: '2026-09-14',
  }) as { id: string }

  const task = await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, {
    title: 'Should Not Appear In Backlog',
    status: 'todo',
  }) as { id: string; version: number }

  await apiPatch(token, `/projects/${projectId}/boards/${boardId}/tasks/${task.id}`, {
    sprint_id: sprint.id,
    version: task.version,
  })

  await page.reload()
  await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
  await page.getByRole('tab', { name: 'Backlog' }).click()

  await expect(page.getByText('Should Not Appear In Backlog')).not.toBeVisible({ timeout: 5000 })
})

test('Creating a task from Backlog view prompts for a board selection', async ({ page }) => {
  await page.getByRole('tab', { name: 'Backlog' }).click()
  await page.getByRole('button', { name: 'New task' }).first().click()

  await expect(page.getByLabel('Board')).toBeVisible({ timeout: 3000 })
})

// ── UI: Active Sprint tab ──────────────────────────────────────────────────────

test('Active Sprint tab appears when a sprint is activated', async ({ page }) => {
  const sprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'My Active Sprint',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  }) as { id: string }

  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints/${sprint.id}/activate`, {})

  await page.reload()
  await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('tab', { name: 'Active Sprint' })).toBeVisible({ timeout: 5000 })
})

test('Active Sprint tab shows tasks in the active sprint', async ({ page }) => {
  const sprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Sprint With Tasks',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  }) as { id: string }

  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints/${sprint.id}/activate`, {})

  const task = await apiPost(token, `/projects/${projectId}/boards/${boardId}/tasks`, {
    title: 'Sprint Task Visible',
    status: 'todo',
  }) as { id: string; version: number }

  await apiPatch(token, `/projects/${projectId}/boards/${boardId}/tasks/${task.id}`, {
    sprint_id: sprint.id,
    version: task.version,
  })

  await page.reload()
  await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
  await page.getByRole('tab', { name: 'Active Sprint' }).click()

  await expect(page.getByText('Sprint Task Visible')).toBeVisible({ timeout: 5000 })
})

test('Active Sprint tab disappears after sprint is closed', async ({ page }) => {
  const sprint = await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints`, {
    name: 'Closing Sprint',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  }) as { id: string }

  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints/${sprint.id}/activate`, {})

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Active Sprint' })).toBeVisible({ timeout: 10000 })

  // Close the sprint via API
  await apiPost(token, `/projects/${projectId}/boards/${boardId}/sprints/${sprint.id}/close`, {})

  await page.reload()
  await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('tab', { name: 'Active Sprint' })).not.toBeVisible({ timeout: 5000 })
})

test('switching from special tab to a board tab restores board view', async ({ page }) => {
  await page.getByRole('tab', { name: 'Backlog' }).click()
  await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('aria-selected', 'true')

  // Click first regular board tab
  const boardTab = page.locator('[role="tab"]').filter({ hasText: /^(?!Backlog|Active Sprint)/ }).first()
  await boardTab.click()
  await expect(boardTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('aria-selected', 'false')
})
