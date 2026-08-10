import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost/api/v1'

export const handlers = [
  http.post(`${BASE}/auth/login`, () =>
    HttpResponse.json({ access_token: 'test-token', token_type: 'bearer' })
  ),
  // REQ-150: SSO discovery — null keeps the Google button hidden in tests.
  http.get(`${BASE}/auth/providers`, () =>
    HttpResponse.json({ google_client_id: null })
  ),
  // REQ-152: identity filter id sets
  http.get(`${BASE}/projects/:wsId/related-to-me`, () =>
    HttpResponse.json({ commented: [], mentioned: [] })
  ),
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    if (body.invite_token) {
      return HttpResponse.json({ workspace_id: 'ws-1' }, { status: 201 })
    }
    return HttpResponse.json({ message: 'Verification code sent. Check your email.', expires_in_minutes: 15 }, { status: 201 })
  }),
  http.post(`${BASE}/auth/verify-email`, () =>
    HttpResponse.json({ access_token: 'test-token', token_type: 'bearer' })
  ),
  http.post(`${BASE}/auth/resend-verification`, () =>
    HttpResponse.json({ message: 'New verification code sent.' })
  ),
  // REQ-154: password reset
  http.post(`${BASE}/auth/forgot-password`, () =>
    HttpResponse.json({ message: 'If that email is registered, a reset code has been sent.' })
  ),
  http.post(`${BASE}/auth/reset-password`, () =>
    HttpResponse.json({ message: 'Password updated. You can now sign in.' })
  ),
  http.get(`${BASE}/auth/me`, () =>
    HttpResponse.json({
      id: 'user-1', email: 'test@test.com', username: 'testuser', is_verified: true, created_at: '',
      first_name: 'Test', last_name: 'User', avatar_url: null, initials: 'TU',
    })
  ),
  http.get(`${BASE}/projects`, () =>
    HttpResponse.json([{ id: 'ws-1', name: 'My Workspace', owner_id: 'user-1', created_at: '' }])
  ),
  http.post(`${BASE}/projects`, async ({ request }) => {
    const body = await request.json() as { name: string }
    return HttpResponse.json({ id: 'ws-2', name: body.name, owner_id: 'user-1', created_at: '' })
  }),
  http.patch(`${BASE}/projects/:wsId`, async ({ params, request }) => {
    const body = await request.json() as { name: string }
    return HttpResponse.json({ id: params.wsId, name: body.name, owner_id: 'user-1', created_at: '' })
  }),
  http.delete(`${BASE}/projects/:wsId`, () =>
    new HttpResponse(null, { status: 204 })
  ),

  // Boards
  http.get(`${BASE}/projects/:wsId/boards`, () =>
    HttpResponse.json([
      { id: 'b-1', name: 'Sprint 1', workspace_id: 'ws-1', created_at: '' },
      { id: 'b-2', name: 'Sprint 2', workspace_id: 'ws-1', created_at: '' },
    ])
  ),
  http.post(`${BASE}/projects/:wsId/boards`, async ({ params, request }) => {
    const body = await request.json() as { name: string }
    return HttpResponse.json({ id: 'b-3', name: body.name, workspace_id: params.wsId, created_at: '' }, { status: 201 })
  }),
  http.patch(`${BASE}/projects/:wsId/boards/:boardId`, async ({ params, request }) => {
    const body = await request.json() as { name: string }
    return HttpResponse.json({ id: params.boardId, name: body.name, workspace_id: params.wsId, created_at: '' })
  }),
  http.delete(`${BASE}/projects/:wsId/boards/:boardId`, () =>
    new HttpResponse(null, { status: 204 })
  ),

  // Tasks (board-scoped)
  http.get(`${BASE}/projects/:wsId/boards/:boardId/tasks`, () =>
    HttpResponse.json([
      { id: 'task-1', title: 'Fix the bug', description: null, status: 'todo', issue_type: 'task', priority_id: null, position: 0, workspace_id: 'ws-1', board_id: 'b-1', assignee_id: null, due_date: null, version: 1, sub_tasks: [], tags: [], created_at: '', updated_at: '' },
      { id: 'task-2', title: 'Deploy it', description: null, status: 'in_progress', issue_type: 'task', priority_id: null, position: 0, workspace_id: 'ws-1', board_id: 'b-1', assignee_id: null, due_date: null, version: 1, sub_tasks: [], tags: [], created_at: '', updated_at: '' },
    ])
  ),
  http.post(`${BASE}/projects/:wsId/boards/:boardId/tasks`, async ({ params, request }) => {
    const body = await request.json() as { title: string; status: string; priority_id?: string | null }
    return HttpResponse.json({
      id: 'task-3', title: body.title, description: null, status: body.status ?? 'todo',
      priority_id: body.priority_id ?? null, position: 0, workspace_id: params.wsId, board_id: params.boardId,
      assignee_id: null, due_date: null, version: 1, sub_tasks: [], created_at: '', updated_at: '',
    }, { status: 201 })
  }),
  http.patch(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: params.taskId, title: 'Fix the bug', description: null, status: body.status ?? 'todo',
      priority_id: null, position: 0, workspace_id: params.wsId, board_id: params.boardId,
      assignee_id: null, due_date: null, version: 2, sub_tasks: [], created_at: '', updated_at: '',
    })
  }),
  http.delete(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId`, () =>
    new HttpResponse(null, { status: 204 })
  ),

  // Attachments
  http.get(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/attachments`, () =>
    HttpResponse.json([])
  ),
  http.post(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/attachments`, () =>
    HttpResponse.json(
      { id: 'att-1', task_id: 'task-1', filename: 'doc.txt', content_type: 'text/plain', size_bytes: 5, created_at: '' },
      { status: 201 }
    )
  ),
  http.get(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/attachments/:attId/download`, () =>
    new HttpResponse(new Uint8Array([104, 101, 108, 108, 111]).buffer, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="doc.txt"',
      },
    })
  ),
  http.delete(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/attachments/:attId`, () =>
    new HttpResponse(null, { status: 204 })
  ),

  // Comments
  http.get(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/comments`, () =>
    HttpResponse.json([])
  ),
  http.post(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/comments`, async ({ params, request }) => {
    const body = await request.json() as { content: string }
    return HttpResponse.json({
      id: 'c-1', task_id: params.taskId, author_id: 'user-1',
      content: body.content, created_at: new Date().toISOString(), edited_at: null,
    }, { status: 201 })
  }),
  http.patch(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/comments/:commentId`, async ({ params, request }) => {
    const body = await request.json() as { content: string }
    return HttpResponse.json({
      id: params.commentId, task_id: params.taskId, author_id: 'user-1',
      content: body.content, created_at: new Date().toISOString(), edited_at: new Date().toISOString(),
    })
  }),
  http.delete(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/comments/:commentId`, () =>
    new HttpResponse(null, { status: 204 })
  ),
  http.get(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/comments/:commentId/history`, () =>
    HttpResponse.json([])
  ),
  http.get(`${BASE}/projects/:wsId/boards/:boardId/tasks/:taskId/comments/:commentId/attachments`, () =>
    HttpResponse.json([])
  ),

  // Invite accept — used by LoginPage REQ-042 tests
  http.post(`${BASE}/invites/:token/accept`, () =>
    HttpResponse.json({ project_id: 'ws-1' })
  ),

  // Invite metadata — HW-23: LoginPage pre-fills the invited email from it
  http.get(`${BASE}/invites/:token`, () =>
    HttpResponse.json({
      project_id: 'ws-1', workspace_name: 'Orbit WS', email: 'invited@test.io',
      expired: false, used: false, user_exists: true,
    })
  ),
]
