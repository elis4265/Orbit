import axios from 'axios'
import type {
  AdminUser,
  AdminUserList,
  DefaultAssigneeMode,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  TokenResponse,
  User,
  MyWorkFacet,
  ApiToken,
  ApiTokenCreated,
  WorkLog,
  WorkLogList,
  RecurringTask,
  RecurrenceCadence,
  OutboundWebhook,
  OutboundWebhookCreated,
  WebhookEvent,
  WebhookFormat,
  UserProfileUpdate,
  Project,
  Board,
  BoardFilterConfig,
  Task,
  TaskCreate,
  TaskUpdate,
  BaselinePrediction,
  SubTask,
  Attachment,
  ProjectMember,
  ProjectInvite,
  InviteMetadata,
  MemberRole,
  Comment,
  CommentHistoryEntry,
  Notification,
  NotificationPreferences,
  WatchStatus,
  Tag,
  TagVisibility,
  CustomEmote,
  ActivityEntry,
  PaginatedAuditLog,
  TaskLink,
  TaskLinkCreate,
  TaskSearchResult,
  Sprint,
  SprintCreate,
  SprintUpdate,
  SprintCompleteRequest,
  Release,
  ReleaseCreate,
  ReleaseUpdate,
  TaskTemplate,
  TaskTemplateCreate,
  CycleConfig,
  CycleConfigUpdate,
  EstimationMethod,
  VelocityResponse,
  SprintReport,
  ForecastResponse,
  CustomField,
  CustomFieldCreate,
  AutomationRule,
  AutomationRuleCreate,
  StatsResponse,
  BurndownPoint,
  CFDPoint,
  TimeInStatusPoint,
  CycleTimeResponse,
  ProjectStatus,
  ProjectStatusCreate,
  ProjectStatusUpdate,
  TransitionRule,
  ProjectMode,
  CreationStatusPolicy,
  PriorityItem,
  PriorityScheme,
  SavedSearch,
  SavedSearchCreate,
  SavedSearchUpdate,
} from '../types'

const BASE_URL = '/api/v1'

export const http = axios.create({ baseURL: BASE_URL, withCredentials: true })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing: Promise<string> | null = null

http.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config
    if (
      err.response?.status !== 401 ||
      original._retry ||
      original.url?.includes('/auth/')
    ) {
      return Promise.reject(err)
    }
    original._retry = true

    try {
      if (!refreshing) {
        refreshing = http
          .post<TokenResponse>('/auth/refresh', {}, { withCredentials: true })
          .then((r) => {
            localStorage.setItem('access_token', r.data.access_token)
            return r.data.access_token
          })
          .finally(() => { refreshing = null })
      }
      const token = await refreshing
      original.headers.Authorization = `Bearer ${token}`
      return http(original)
    } catch {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
      return Promise.reject(err)
    }
  }
)

// Auth
export const authApi = {
  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const form = new URLSearchParams()
    form.append('username', data.username)
    form.append('password', data.password)
    const res = await http.post<TokenResponse>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return res.data
  },
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const res = await http.post<RegisterResponse>('/auth/register', data)
    return res.data
  },
  verifyEmail: async (data: VerifyEmailRequest): Promise<TokenResponse> => {
    const res = await http.post<TokenResponse>('/auth/verify-email', data)
    return res.data
  },
  resendVerification: async (email: string): Promise<RegisterResponse> => {
    const res = await http.post<RegisterResponse>('/auth/resend-verification', { email })
    return res.data
  },
  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const res = await http.post<{ message: string }>('/auth/forgot-password', { email })
    return res.data
  },
  resetPassword: async (data: { email: string; code: string; new_password: string; revoke_api_tokens?: boolean }): Promise<{ message: string }> => {
    const res = await http.post<{ message: string }>('/auth/reset-password', data)
    return res.data
  },
  changePassword: async (data: { current_password: string; new_password: string; revoke_api_tokens?: boolean }): Promise<{ message: string }> => {
    const res = await http.post<{ message: string }>('/users/me/change-password', data)
    return res.data
  },
  me: async (): Promise<User> => {
    const res = await http.get<User>('/auth/me')
    return res.data
  },
  logout: async (): Promise<void> => {
    await http.post('/auth/logout')
  },
}

// REQ-160: import from other trackers (admin) — per-entity error report
export interface TrackerImportResult {
  created: number
  errors: { entity: string; error: string }[]
}

export const trackerImportApi = {
  trello: async (projectId: string, file: File): Promise<TrackerImportResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await http.post<TrackerImportResult>(`/projects/${projectId}/import/trello`, form)
    return res.data
  },
  jira: async (projectId: string, file: File): Promise<TrackerImportResult> => {
    const form = new FormData()
    form.append('file', file)
    const res = await http.post<TrackerImportResult>(`/projects/${projectId}/import/jira`, form)
    return res.data
  },
}

// REQ-163: public share links
export interface ShareLink {
  id: string
  token: string
  revoked: boolean
  created_at: string
}

export const shareLinkApi = {
  create: async (projectId: string, taskId: string): Promise<ShareLink> => {
    const res = await http.post<ShareLink>(`/projects/${projectId}/tasks/${taskId}/share-links`)
    return res.data
  },
  list: async (projectId: string, taskId: string): Promise<ShareLink[]> => {
    const res = await http.get<ShareLink[]>(`/projects/${projectId}/tasks/${taskId}/share-links`)
    return res.data
  },
  revoke: async (projectId: string, taskId: string, linkId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}/share-links/${linkId}`)
  },
  publicTask: async (token: string) => {
    const res = await http.get(`/share/${token}`)
    return res.data
  },
}

// Instance admin (REQ-155) — superuser only
export const adminApi = {
  listUsers: async (q?: string): Promise<AdminUserList> => {
    const res = await http.get<AdminUserList>('/admin/users', { params: q ? { q } : {} })
    return res.data
  },
  setActive: async (userId: string, isActive: boolean): Promise<AdminUser> => {
    const res = await http.patch<AdminUser>(`/admin/users/${userId}`, { is_active: isActive })
    return res.data
  },
  triggerPasswordReset: async (userId: string): Promise<{ message: string }> => {
    const res = await http.post<{ message: string }>(`/admin/users/${userId}/reset-password`)
    return res.data
  },
}

// Projects
export const projectApi = {
  list: async (): Promise<Project[]> => {
    const res = await http.get<Project[]>('/projects')
    return res.data
  },
  create: async (name: string, mode: ProjectMode = 'open'): Promise<Project> => {
    const res = await http.post<Project>('/projects', { name, mode })
    return res.data
  },
  rename: async (id: string, name: string): Promise<Project> => {
    const res = await http.patch<Project>(`/projects/${id}`, { name })
    return res.data
  },
  updateHideDoneAfterDays: async (id: string, days: number | null): Promise<Project> => {
    const res = await http.patch<Project>(`/projects/${id}`, { hide_done_after_days: days })
    return res.data
  },
  // REQ-161
  updateAutoArchiveAfterDays: async (id: string, days: number | null): Promise<Project> => {
    const res = await http.patch<Project>(`/projects/${id}`, { auto_archive_after_days: days })
    return res.data
  },
  // HW-18: default assignee for newly created tasks. The id is only meaningful
  // under mode 'member'; the server clears it for the other modes anyway.
  updateDefaultAssignee: async (
    id: string,
    mode: DefaultAssigneeMode,
    assigneeId: string | null,
  ): Promise<Project> => {
    const res = await http.patch<Project>(`/projects/${id}`, {
      default_assignee_mode: mode,
      default_assignee_id: mode === 'member' ? assigneeId : null,
    })
    return res.data
  },
  delete: async (id: string): Promise<void> => {
    await http.delete(`/projects/${id}`)
  },
}

// Boards
export const boardApi = {
  list: async (projectId: string): Promise<Board[]> => {
    const res = await http.get<Board[]>(`/projects/${projectId}/boards`)
    return res.data
  },
  create: async (projectId: string, name: string): Promise<Board> => {
    const res = await http.post<Board>(`/projects/${projectId}/boards`, { name })
    return res.data
  },
  rename: async (projectId: string, boardId: string, name: string): Promise<Board> => {
    const res = await http.patch<Board>(`/projects/${projectId}/boards/${boardId}`, { name })
    return res.data
  },
  updateFilter: async (
    projectId: string,
    boardId: string,
    filterConfig: BoardFilterConfig | null,
  ): Promise<Board> => {
    const res = await http.patch<Board>(
      `/projects/${projectId}/boards/${boardId}/filter`,
      { filter_config: filterConfig },
    )
    return res.data
  },
  delete: async (projectId: string, boardId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/boards/${boardId}`)
  },
}

// Subtasks
export const subtaskApi = {
  create: async (projectId: string, taskId: string, title: string): Promise<SubTask> => {
    const res = await http.post<SubTask>(`/projects/${projectId}/tasks/${taskId}/subtasks`, { title })
    return res.data
  },
  toggle: async (projectId: string, taskId: string, subtaskId: string): Promise<SubTask> => {
    const res = await http.patch<SubTask>(`/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`)
    return res.data
  },
  delete: async (projectId: string, taskId: string, subtaskId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`)
  },
  // REQ-164: detach a child into a standalone task (relates_to link kept)
  promote: async (projectId: string, taskId: string, subtaskId: string): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}/promote`)
    return res.data
  },
}

// Attachments
export const attachmentApi = {
  list: async (projectId: string, taskId: string): Promise<Attachment[]> => {
    const res = await http.get<Attachment[]>(
      `/projects/${projectId}/tasks/${taskId}/attachments`
    )
    return res.data
  },
  upload: async (projectId: string, taskId: string, file: File): Promise<Attachment> => {
    const form = new FormData()
    form.append('file', file)
    const res = await http.post<Attachment>(
      `/projects/${projectId}/tasks/${taskId}/attachments`,
      form,
    )
    return res.data
  },
  download: async (projectId: string, taskId: string, attachmentId: string): Promise<Blob> => {
    const res = await http.get(
      `/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`,
      { responseType: 'blob' }
    )
    return res.data as Blob
  },
  delete: async (projectId: string, taskId: string, attachmentId: string): Promise<void> => {
    await http.delete(
      `/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`
    )
  },
}

// Members
export const memberApi = {
  list: async (projectId: string): Promise<ProjectMember[]> => {
    const res = await http.get<ProjectMember[]>(`/projects/${projectId}/members`)
    return res.data
  },
  invite: async (projectId: string, email: string): Promise<ProjectInvite> => {
    const res = await http.post<ProjectInvite>(`/projects/${projectId}/invites`, { email })
    return res.data
  },
  promote: async (projectId: string, userId: string, role: MemberRole): Promise<ProjectMember> => {
    const res = await http.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, { role })
    return res.data
  },
  remove: async (projectId: string, userId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/members/${userId}`)
  },
  acceptInvite: async (token: string): Promise<{ project_id: string }> => {
    const res = await http.post<{ project_id: string }>(`/invites/${token}/accept`)
    return res.data
  },
  getInviteMetadata: async (token: string): Promise<InviteMetadata> => {
    const res = await http.get<InviteMetadata>(`/invites/${token}`)
    return res.data
  },
}

// Comments
export const commentApi = {
  list: async (projectId: string, taskId: string): Promise<Comment[]> => {
    const res = await http.get<Comment[]>(
      `/projects/${projectId}/tasks/${taskId}/comments`
    )
    return res.data
  },
  // REQ-162: emoji reactions (curated set; add is idempotent, delete removes own)
  react: async (projectId: string, taskId: string, commentId: string, emoji: string) => {
    const res = await http.post(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/reactions`, { emoji }
    )
    return res.data
  },
  unreact: async (projectId: string, taskId: string, commentId: string, emoji: string) => {
    const res = await http.delete(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/reactions`, { data: { emoji } }
    )
    return res.data
  },
  create: async (projectId: string, taskId: string, content: string): Promise<Comment> => {
    const res = await http.post<Comment>(
      `/projects/${projectId}/tasks/${taskId}/comments`,
      { content }
    )
    return res.data
  },
  edit: async (projectId: string, taskId: string, commentId: string, content: string): Promise<Comment> => {
    const res = await http.patch<Comment>(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      { content }
    )
    return res.data
  },
  delete: async (projectId: string, taskId: string, commentId: string): Promise<void> => {
    await http.delete(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`
    )
  },
  history: async (projectId: string, taskId: string, commentId: string): Promise<CommentHistoryEntry[]> => {
    const res = await http.get<CommentHistoryEntry[]>(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/history`
    )
    return res.data
  },
  listAttachments: async (projectId: string, taskId: string, commentId: string): Promise<Attachment[]> => {
    const res = await http.get<Attachment[]>(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/attachments`
    )
    return res.data
  },
  uploadAttachment: async (projectId: string, taskId: string, commentId: string, file: File): Promise<Attachment> => {
    const form = new FormData()
    form.append('file', file)
    const res = await http.post<Attachment>(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/attachments`,
      form,
    )
    return res.data
  },
  downloadAttachment: async (projectId: string, taskId: string, commentId: string, attachmentId: string): Promise<Blob> => {
    const res = await http.get(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/attachments/${attachmentId}/download`,
      { responseType: 'blob' }
    )
    return res.data as Blob
  },
  deleteAttachment: async (projectId: string, taskId: string, commentId: string, attachmentId: string): Promise<void> => {
    await http.delete(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}/attachments/${attachmentId}`
    )
  },
}

// Watchers
export const watcherApi = {
  list: async (projectId: string, taskId: string): Promise<User[]> => {
    const res = await http.get<User[]>(
      `/projects/${projectId}/tasks/${taskId}/watchers`
    )
    return res.data
  },
  status: async (projectId: string, taskId: string): Promise<WatchStatus> => {
    const res = await http.get<WatchStatus>(
      `/projects/${projectId}/tasks/${taskId}/watch/me`
    )
    return res.data
  },
  watch: async (projectId: string, taskId: string): Promise<void> => {
    await http.post(`/projects/${projectId}/tasks/${taskId}/watch`)
  },
  unwatch: async (projectId: string, taskId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}/watch`)
  },
}

// Notifications
export const notificationApi = {
  list: async (unread?: boolean): Promise<Notification[]> => {
    const res = await http.get<Notification[]>('/notifications', {
      params: unread != null ? { unread } : undefined,
    })
    return res.data
  },
  unreadCount: async (): Promise<{ count: number }> => {
    const res = await http.get<{ count: number }>('/notifications/unread-count')
    return res.data
  },
  markRead: async (id: string): Promise<void> => {
    await http.patch(`/notifications/${id}/read`)
  },
  markAllRead: async (): Promise<void> => {
    await http.patch('/notifications/read-all')
  },
  deleteOne: async (id: string): Promise<void> => {
    await http.delete(`/notifications/${id}`)
  },
  deleteAll: async (): Promise<void> => {
    await http.delete('/notifications')
  },
  getPreferences: async (projectId: string): Promise<NotificationPreferences> => {
    const res = await http.get<NotificationPreferences>(
      `/projects/${projectId}/notification-preferences`
    )
    return res.data
  },
  updatePreferences: async (projectId: string, prefs: NotificationPreferences): Promise<NotificationPreferences> => {
    const res = await http.put<NotificationPreferences>(
      `/projects/${projectId}/notification-preferences`,
      prefs,
    )
    return res.data
  },
}

// Tags
export const tagApi = {
  list: async (projectId: string): Promise<Tag[]> => {
    const res = await http.get<Tag[]>(`/projects/${projectId}/tags`)
    return res.data
  },
  create: async (projectId: string, name: string, color?: string, visibility?: TagVisibility): Promise<Tag> => {
    const res = await http.post<Tag>(`/projects/${projectId}/tags`, { name, color, visibility })
    return res.data
  },
  update: async (projectId: string, tagId: string, data: { name?: string; color?: string; visibility?: TagVisibility }): Promise<Tag> => {
    const res = await http.patch<Tag>(`/projects/${projectId}/tags/${tagId}`, data)
    return res.data
  },
  delete: async (projectId: string, tagId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tags/${tagId}`)
  },
  listTaskTags: async (projectId: string, taskId: string): Promise<Tag[]> => {
    const res = await http.get<Tag[]>(
      `/projects/${projectId}/tasks/${taskId}/tags`
    )
    return res.data
  },
  applyToTask: async (projectId: string, taskId: string, tagId: string): Promise<void> => {
    await http.post(`/projects/${projectId}/tasks/${taskId}/tags/${tagId}`)
  },
  removeFromTask: async (projectId: string, taskId: string, tagId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}/tags/${tagId}`)
  },
}

// Custom reaction emotes (Teams model)
export const emoteApi = {
  list: async (projectId: string): Promise<CustomEmote[]> => {
    const res = await http.get<CustomEmote[]>(`/projects/${projectId}/emotes`)
    return res.data
  },
  create: async (projectId: string, name: string, file: File): Promise<CustomEmote> => {
    const form = new FormData()
    form.append('name', name)
    form.append('file', file)
    const res = await http.post<CustomEmote>(`/projects/${projectId}/emotes`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
  delete: async (projectId: string, emoteId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/emotes/${emoteId}`)
  },
}

// Activity
export interface ProjectActivityFilters {
  actor_ids?: string[]
  exclude_actor_ids?: string[]
  actions?: string[]
  exclude_actions?: string[]
  entity_types?: string[]
  entity_name_search?: string
  date_from?: string
  date_to?: string
  after_id?: number
  before_id?: number
}

export interface PaginatedActivity {
  items: ActivityEntry[]
  total: number
  next_cursor: number | null
}

function appendArr(p: URLSearchParams, key: string, vals?: string[]) {
  vals?.forEach(v => p.append(key, v))
}

function appendExtra(p: URLSearchParams, extra: Record<string, unknown>) {
  Object.entries(extra).forEach(([k, v]) => { if (v != null) p.append(k, String(v)) })
}

// Serializes ProjectActivityFilters → URLSearchParams so arrays become repeated params
// (actor_ids=a&actor_ids=b) instead of Axios bracket notation (actor_ids[]=a)
function buildActivityParams(
  filters: ProjectActivityFilters,
  extra: Record<string, unknown> = {},
): URLSearchParams {
  const p = new URLSearchParams()
  appendArr(p, 'actor_ids', filters.actor_ids)
  appendArr(p, 'exclude_actor_ids', filters.exclude_actor_ids)
  appendArr(p, 'actions', filters.actions)
  appendArr(p, 'exclude_actions', filters.exclude_actions)
  appendArr(p, 'entity_types', filters.entity_types)
  if (filters.entity_name_search) p.append('entity_name_search', filters.entity_name_search)
  if (filters.date_from) p.append('date_from', filters.date_from)
  if (filters.date_to) p.append('date_to', filters.date_to)
  if (filters.after_id != null) p.append('after_id', String(filters.after_id))
  if (filters.before_id != null) p.append('before_id', String(filters.before_id))
  appendExtra(p, extra)
  return p
}

export const activityApi = {
  list: async (
    projectId: string,
    taskId: string,
    limit = 100,
    actions?: string[],
  ): Promise<ActivityEntry[]> => {
    const p = new URLSearchParams({ limit: String(limit) })
    actions?.forEach(a => p.append('actions', a))
    const res = await http.get<ActivityEntry[]>(
      `/projects/${projectId}/tasks/${taskId}/activity`,
      { params: p },
    )
    return res.data
  },
  exportBlob: async (projectId: string, taskId: string, format: 'csv' | 'json'): Promise<Blob> => {
    const res = await http.get(
      `/projects/${projectId}/tasks/${taskId}/activity/export`,
      { params: { format }, responseType: 'blob' },
    )
    return res.data as Blob
  },
  listWorkspace: async (
    projectId: string,
    filters: ProjectActivityFilters = {},
    limit = 50,
    offset = 0,
  ): Promise<PaginatedActivity> => {
    const res = await http.get<PaginatedActivity>(`/projects/${projectId}/activity`, {
      params: buildActivityParams(filters, { limit, offset }),
    })
    return res.data
  },
  exportWorkspaceBlob: async (
    projectId: string,
    filters: ProjectActivityFilters = {},
    format: 'csv' | 'json',
  ): Promise<Blob> => {
    const res = await http.get(`/projects/${projectId}/activity/export`, {
      params: buildActivityParams(filters, { format }),
      responseType: 'blob',
    })
    return res.data as Blob
  },
}

export interface AuditLogFilters {
  actor_ids?: string[]
  exclude_actor_ids?: string[]
  actions?: string[]
  exclude_actions?: string[]
  entity_types?: string[]
  entity_name_search?: string
  date_from?: string
  date_to?: string
  after_id?: number
  before_id?: number
}

function buildAuditParams(
  filters: AuditLogFilters,
  extra: Record<string, unknown> = {},
): URLSearchParams {
  const p = new URLSearchParams()
  appendArr(p, 'actor_ids', filters.actor_ids)
  appendArr(p, 'exclude_actor_ids', filters.exclude_actor_ids)
  appendArr(p, 'actions', filters.actions)
  appendArr(p, 'exclude_actions', filters.exclude_actions)
  appendArr(p, 'entity_types', filters.entity_types)
  if (filters.entity_name_search) p.append('entity_name_search', filters.entity_name_search)
  if (filters.date_from) p.append('date_from', filters.date_from)
  if (filters.date_to) p.append('date_to', filters.date_to)
  if (filters.after_id != null) p.append('after_id', String(filters.after_id))
  if (filters.before_id != null) p.append('before_id', String(filters.before_id))
  appendExtra(p, extra)
  return p
}

export const auditApi = {
  list: async (
    projectId: string,
    filters: AuditLogFilters = {},
    limit = 50,
    offset = 0,
  ): Promise<PaginatedAuditLog> => {
    const res = await http.get<PaginatedAuditLog>(`/projects/${projectId}/audit`, {
      params: buildAuditParams(filters, { limit, offset }),
    })
    return res.data
  },
  exportBlob: async (
    projectId: string,
    filters: AuditLogFilters = {},
    format: 'csv' | 'json',
  ): Promise<Blob> => {
    const res = await http.get(`/projects/${projectId}/audit/export`, {
      params: buildAuditParams(filters, { format }),
      responseType: 'blob',
    })
    return res.data as Blob
  },
}

// Stats
export const statsApi = {
  getStats: async (
    projectId: string,
    params?: { board_id?: string; date_from?: string; date_to?: string },
  ): Promise<StatsResponse> => {
    const res = await http.get<StatsResponse>(`/projects/${projectId}/stats`, { params })
    return res.data
  },
  getBurndown: async (
    projectId: string,
    params?: { board_id?: string; start?: string; end?: string; unit?: string },
  ): Promise<BurndownPoint[]> => {
    const res = await http.get<BurndownPoint[]>(`/projects/${projectId}/stats/burndown`, { params })
    return res.data
  },
  getCFD: async (
    projectId: string,
    params?: { board_id?: string; date_from?: string; date_to?: string },
  ): Promise<CFDPoint[]> => {
    const res = await http.get<CFDPoint[]>(`/projects/${projectId}/stats/cfd`, { params })
    return res.data
  },
  getTimeInStatus: async (
    projectId: string,
    params?: { board_id?: string },
  ): Promise<TimeInStatusPoint[]> => {
    const res = await http.get<TimeInStatusPoint[]>(`/projects/${projectId}/stats/time-in-status`, { params })
    return res.data
  },
  getCycleTime: async (
    projectId: string,
    params?: { board_id?: string; date_from?: string; date_to?: string },
  ): Promise<CycleTimeResponse> => {
    const res = await http.get<CycleTimeResponse>(`/projects/${projectId}/stats/cycle-time`, { params })
    return res.data
  },
  getVelocity: async (projectId: string, window?: number): Promise<VelocityResponse> => {
    const res = await http.get<VelocityResponse>(`/projects/${projectId}/stats/velocity`, { params: window ? { window } : undefined })
    return res.data
  },
  getSprintReport: async (projectId: string, sprintId: string): Promise<SprintReport> => {
    const res = await http.get<SprintReport>(`/projects/${projectId}/stats/sprint-report/${sprintId}`)
    return res.data
  },
  getForecast: async (projectId: string, params?: { weeks?: number; remaining?: number }): Promise<ForecastResponse> => {
    const res = await http.get<ForecastResponse>(`/projects/${projectId}/stats/forecast`, { params })
    return res.data
  },
}

// Sprints
export const sprintApi = {
  list: async (projectId: string, boardId: string): Promise<Sprint[]> => {
    const res = await http.get<Sprint[]>(`/projects/${projectId}/boards/${boardId}/sprints`)
    return res.data
  },
  create: async (projectId: string, boardId: string, data: SprintCreate): Promise<Sprint> => {
    const res = await http.post<Sprint>(`/projects/${projectId}/boards/${boardId}/sprints`, data)
    return res.data
  },
  update: async (projectId: string, boardId: string, sprintId: string, data: SprintUpdate): Promise<Sprint> => {
    const res = await http.patch<Sprint>(`/projects/${projectId}/boards/${boardId}/sprints/${sprintId}`, data)
    return res.data
  },
  activate: async (projectId: string, boardId: string, sprintId: string): Promise<Sprint> => {
    const res = await http.post<Sprint>(`/projects/${projectId}/boards/${boardId}/sprints/${sprintId}/activate`)
    return res.data
  },
  close: async (projectId: string, boardId: string, sprintId: string): Promise<Sprint> => {
    const res = await http.post<Sprint>(`/projects/${projectId}/boards/${boardId}/sprints/${sprintId}/close`)
    return res.data
  },
  complete: async (
    projectId: string,
    boardId: string,
    sprintId: string,
    body: SprintCompleteRequest,
  ): Promise<Sprint> => {
    const res = await http.post<Sprint>(
      `/projects/${projectId}/boards/${boardId}/sprints/${sprintId}/complete`,
      body,
    )
    return res.data
  },
  delete: async (projectId: string, boardId: string, sprintId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/boards/${boardId}/sprints/${sprintId}`)
  },
}

export const releaseApi = {
  list: async (projectId: string): Promise<Release[]> => {
    const res = await http.get<Release[]>(`/projects/${projectId}/releases`)
    return res.data
  },
  create: async (projectId: string, data: ReleaseCreate): Promise<Release> => {
    const res = await http.post<Release>(`/projects/${projectId}/releases`, data)
    return res.data
  },
  update: async (projectId: string, releaseId: string, data: ReleaseUpdate): Promise<Release> => {
    const res = await http.patch<Release>(`/projects/${projectId}/releases/${releaseId}`, data)
    return res.data
  },
  ship: async (projectId: string, releaseId: string, body?: { unfinished_action: 'keep' | 'backlog' | 'move'; target_release_id?: string | null }): Promise<{ id: string; status: string; total_tasks: number; done_tasks: number; incomplete_tasks: number; clean: boolean }> => {
    const res = await http.post(`/projects/${projectId}/releases/${releaseId}/ship`, body ?? {})
    return res.data
  },
  delete: async (projectId: string, releaseId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/releases/${releaseId}`)
  },
}

// Flow-mode automated cycles
export const cycleApi = {
  getConfig: async (projectId: string): Promise<CycleConfig | null> => {
    const res = await http.get<CycleConfig | null>(`/projects/${projectId}/cycle-config`)
    return res.data
  },
  putConfig: async (projectId: string, data: CycleConfigUpdate): Promise<CycleConfig> => {
    const res = await http.put<CycleConfig>(`/projects/${projectId}/cycle-config`, data)
    return res.data
  },
  list: async (projectId: string): Promise<Sprint[]> => {
    const res = await http.get<Sprint[]>(`/projects/${projectId}/cycles`)
    return res.data
  },
}

export const relatedApi = {
  get: async (projectId: string): Promise<{ commented: string[]; mentioned: string[] }> => {
    const res = await http.get(`/projects/${projectId}/related-to-me`)
    return res.data
  },
}

export const importApi = {
  csv: async (projectId: string, file: File): Promise<{ created: number; errors: { row: number; error: string }[] }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await http.post(`/projects/${projectId}/import/csv`, form)
    return res.data
  },
}

export const recurringApi = {
  list: async (projectId: string): Promise<RecurringTask[]> => {
    const res = await http.get<RecurringTask[]>(`/projects/${projectId}/recurring-tasks`)
    return res.data
  },
  create: async (projectId: string, data: { template_id: string; cadence: RecurrenceCadence; weekday?: number; day_of_month?: number }): Promise<RecurringTask> => {
    const res = await http.post<RecurringTask>(`/projects/${projectId}/recurring-tasks`, data)
    return res.data
  },
  update: async (projectId: string, id: string, data: Partial<Pick<RecurringTask, 'cadence' | 'weekday' | 'day_of_month' | 'enabled'>>): Promise<RecurringTask> => {
    const res = await http.patch<RecurringTask>(`/projects/${projectId}/recurring-tasks/${id}`, data)
    return res.data
  },
  delete: async (projectId: string, id: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/recurring-tasks/${id}`)
  },
}

export const worklogApi = {
  list: async (projectId: string, taskId: string): Promise<WorkLogList> => {
    const res = await http.get<WorkLogList>(`/projects/${projectId}/tasks/${taskId}/worklogs`)
    return res.data
  },
  create: async (projectId: string, taskId: string, minutes: number, note?: string): Promise<WorkLog> => {
    const res = await http.post<WorkLog>(`/projects/${projectId}/tasks/${taskId}/worklogs`, { minutes, note: note || null })
    return res.data
  },
  delete: async (projectId: string, taskId: string, worklogId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}/worklogs/${worklogId}`)
  },
}

export const tokenApi = {
  list: async (): Promise<ApiToken[]> => {
    const res = await http.get<ApiToken[]>('/users/me/tokens')
    return res.data
  },
  create: async (name: string, scope: 'read' | 'write'): Promise<ApiTokenCreated> => {
    const res = await http.post<ApiTokenCreated>('/users/me/tokens', { name, scope })
    return res.data
  },
  revoke: async (id: string): Promise<void> => {
    await http.delete(`/users/me/tokens/${id}`)
  },
}

export const webhookApi = {
  list: async (projectId: string): Promise<OutboundWebhook[]> => {
    const res = await http.get<OutboundWebhook[]>(`/projects/${projectId}/webhooks`)
    return res.data
  },
  create: async (projectId: string, url: string, events: WebhookEvent[], format: WebhookFormat = 'json'): Promise<OutboundWebhookCreated> => {
    const res = await http.post<OutboundWebhookCreated>(`/projects/${projectId}/webhooks`, { url, events, format })
    return res.data
  },
  update: async (projectId: string, id: string, data: Partial<Pick<OutboundWebhook, 'url' | 'events' | 'enabled' | 'format'>>): Promise<OutboundWebhook> => {
    const res = await http.patch<OutboundWebhook>(`/projects/${projectId}/webhooks/${id}`, data)
    return res.data
  },
  delete: async (projectId: string, id: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/webhooks/${id}`)
  },
}

export const userApi = {
  myTasks: async (facet: MyWorkFacet): Promise<Task[]> => {
    const res = await http.get<Task[]>('/users/me/tasks', { params: { facet } })
    return res.data
  },
  updateProfile: async (data: UserProfileUpdate): Promise<User> => {
    const res = await http.patch<User>('/users/me', data)
    return res.data
  },
  uploadAvatar: async (file: File): Promise<User> => {
    const form = new FormData()
    form.append('file', file)
    const res = await http.post<User>('/users/me/avatar', form)
    return res.data
  },
  deleteAvatar: async (): Promise<User> => {
    const res = await http.delete<User>('/users/me/avatar')
    return res.data
  },
}

// Tasks (board-scoped for list/create/reorder; project-scoped for update/delete/ai)
export const taskApi = {
  list: async (projectId: string, boardId: string, status?: string, includeOldDone?: boolean): Promise<Task[]> => {
    const params: Record<string, string | boolean> = {}
    if (status) params.status = status
    if (includeOldDone) params.include_old_done = true
    const res = await http.get<Task[]>(`/projects/${projectId}/boards/${boardId}/tasks`, {
      params: Object.keys(params).length ? params : undefined,
    })
    return res.data
  },
  create: async (projectId: string, boardId: string, data: TaskCreate): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/boards/${boardId}/tasks`, data)
    return res.data
  },
  update: async (projectId: string, taskId: string, data: TaskUpdate): Promise<Task> => {
    const res = await http.patch<Task>(`/projects/${projectId}/tasks/${taskId}`, data)
    return res.data
  },
  getPrediction: async (projectId: string, taskId: string): Promise<BaselinePrediction> => {
    const res = await http.get<BaselinePrediction>(`/projects/${projectId}/tasks/${taskId}/prediction`)
    return res.data
  },
  delete: async (projectId: string, taskId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}`)
  },
  aiBreakdown: async (projectId: string, taskId: string): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/tasks/${taskId}/ai-breakdown`)
    return res.data
  },
  // REQ-157: bulk edit — per-row report {updated, errors}
  bulkEdit: async (
    projectId: string, taskIds: string[], changes: Record<string, unknown>
  ): Promise<{ updated: string[]; errors: { task_id: string; error: string }[] }> => {
    const res = await http.patch(`/projects/${projectId}/tasks/bulk`, { task_ids: taskIds, changes })
    return res.data
  },
  // REQ-156: clone within the project / move to another project
  clone: async (projectId: string, taskId: string): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/tasks/${taskId}/clone`)
    return res.data
  },
  move: async (projectId: string, taskId: string, targetProjectId: string): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/tasks/${taskId}/move`, {
      target_project_id: targetProjectId,
    })
    return res.data
  },
  reorder: async (projectId: string, boardId: string, tasks: { id: string; position: number; grid_x?: number; grid_y?: number }[]): Promise<void> => {
    await http.patch(`/projects/${projectId}/boards/${boardId}/tasks/reorder`, { tasks })
  },
  getById: async (projectId: string, taskId: string): Promise<Task> => {
    const res = await http.get<Task>(`/projects/${projectId}/tasks/${taskId}`)
    return res.data
  },
  // REQ-159/166: full server-side CSV export; taskIds narrows to a client-filtered
  // subset (POST — UUID lists don't fit in a query string)
  exportCsv: async (projectId: string, fields?: string, taskIds?: string[]): Promise<string> => {
    if (taskIds) {
      const res = await http.post<string>(
        `/projects/${projectId}/tasks/export`,
        { fields: fields || null, task_ids: taskIds },
        { responseType: 'text', transformResponse: [(data) => data] },
      )
      return res.data
    }
    const res = await http.get<string>(`/projects/${projectId}/tasks/export`, {
      params: fields ? { fields } : undefined,
      responseType: 'text',
      transformResponse: [(data) => data],
    })
    return res.data
  },
}

export const taskLinkApi = {
  list: async (projectId: string, taskId: string): Promise<TaskLink[]> => {
    const res = await http.get<TaskLink[]>(`/projects/${projectId}/tasks/${taskId}/links`)
    return res.data
  },
  add: async (projectId: string, taskId: string, data: TaskLinkCreate): Promise<TaskLink> => {
    const res = await http.post<TaskLink>(`/projects/${projectId}/tasks/${taskId}/links`, data)
    return res.data
  },
  remove: async (projectId: string, taskId: string, linkId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/tasks/${taskId}/links/${linkId}`)
  },
}

export const projectTaskSearchApi = {
  search: async (projectId: string, q: string, limit = 10): Promise<TaskSearchResult[]> => {
    const res = await http.get<TaskSearchResult[]>(`/projects/${projectId}/tasks/search`, { params: { q, limit } })
    return res.data
  },
}

export const taskTemplateApi = {
  list: async (projectId: string): Promise<TaskTemplate[]> => {
    const res = await http.get<TaskTemplate[]>(`/projects/${projectId}/task-templates`)
    return res.data
  },
  create: async (projectId: string, data: TaskTemplateCreate): Promise<TaskTemplate> => {
    const res = await http.post<TaskTemplate>(`/projects/${projectId}/task-templates`, data)
    return res.data
  },
  update: async (projectId: string, templateId: string, data: Partial<TaskTemplateCreate> & { position?: number }): Promise<TaskTemplate> => {
    const res = await http.patch<TaskTemplate>(`/projects/${projectId}/task-templates/${templateId}`, data)
    return res.data
  },
  delete: async (projectId: string, templateId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/task-templates/${templateId}`)
  },
}

// Cross-project (global) search — spans every project the user can access.
export const globalSearchApi = {
  search: async (q: string, limit = 10): Promise<TaskSearchResult[]> => {
    const res = await http.get<TaskSearchResult[]>(`/search/tasks`, { params: { q, limit } })
    return res.data
  },
}

export const projectTaskApi = {
  // REQ-161: includeArchived returns the full list including archived rows
  listArchived: async (projectId: string): Promise<Task[]> => {
    const res = await http.get<Task[]>(`/projects/${projectId}/tasks`, { params: { include_archived: true } })
    return res.data.filter((t) => t.archived_at)
  },
  archive: async (projectId: string, taskId: string): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/tasks/${taskId}/archive`)
    return res.data
  },
  unarchive: async (projectId: string, taskId: string): Promise<Task> => {
    const res = await http.post<Task>(`/projects/${projectId}/tasks/${taskId}/unarchive`)
    return res.data
  },
  list: async (projectId: string, sprintId?: string): Promise<Task[]> => {
    const params: Record<string, string> = {}
    if (sprintId !== undefined) params.sprint_id = sprintId
    const res = await http.get<Task[]>(`/projects/${projectId}/tasks`, { params })
    return res.data
  },
}

// Project statuses + transition rules + mode
export const projectStatusApi = {
  listStatuses: async (projectId: string): Promise<ProjectStatus[]> => {
    const res = await http.get<ProjectStatus[]>(`/projects/${projectId}/statuses`)
    return res.data
  },
  createStatus: async (projectId: string, data: ProjectStatusCreate): Promise<ProjectStatus> => {
    const res = await http.post<ProjectStatus>(`/projects/${projectId}/statuses`, data)
    return res.data
  },
  updateStatus: async (projectId: string, statusId: string, data: ProjectStatusUpdate): Promise<ProjectStatus> => {
    const res = await http.patch<ProjectStatus>(`/projects/${projectId}/statuses/${statusId}`, data)
    return res.data
  },
  deleteStatus: async (projectId: string, statusId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/statuses/${statusId}`)
  },
  reorderStatuses: async (projectId: string, orderedIds: string[]): Promise<ProjectStatus[]> => {
    const res = await http.post<ProjectStatus[]>(`/projects/${projectId}/statuses/reorder`, { ordered_ids: orderedIds })
    return res.data
  },
  listTransitions: async (projectId: string): Promise<TransitionRule[]> => {
    const res = await http.get<TransitionRule[]>(`/projects/${projectId}/transitions`)
    return res.data
  },
  createTransition: async (projectId: string, fromId: string, toId: string, requireRole?: string, issueType?: string | null): Promise<TransitionRule> => {
    const res = await http.post<TransitionRule>(`/projects/${projectId}/transitions`, {
      from_status_id: fromId,
      to_status_id: toId,
      require_role: requireRole,
      issue_type: issueType ?? null,
    })
    return res.data
  },
  deleteTransition: async (projectId: string, ruleId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/transitions/${ruleId}`)
  },
  updateCreationPolicy: async (projectId: string, policy: CreationStatusPolicy): Promise<{ project_id: string; creation_status_policy: CreationStatusPolicy }> => {
    const res = await http.patch(`/projects/${projectId}/creation-policy`, { creation_status_policy: policy })
    return res.data
  },
  updateMode: async (projectId: string, mode: ProjectMode, enforceBlockLinks?: boolean): Promise<{ project_id: string; mode: ProjectMode; status_count: number }> => {
    const body: Record<string, unknown> = { mode }
    if (enforceBlockLinks !== undefined) body.enforce_block_links = enforceBlockLinks
    const res = await http.patch(`/projects/${projectId}/mode`, body)
    return res.data
  },
  updateEstimationMethod: async (projectId: string, estimationMethod: EstimationMethod): Promise<{ project_id: string; estimation_method: EstimationMethod }> => {
    const res = await http.patch(`/projects/${projectId}/estimation-method`, { estimation_method: estimationMethod })
    return res.data
  },
}

// Custom fields
export const customFieldApi = {
  list: async (projectId: string): Promise<CustomField[]> => {
    const res = await http.get<CustomField[]>(`/projects/${projectId}/custom-fields`)
    return res.data
  },
  create: async (projectId: string, data: CustomFieldCreate): Promise<CustomField> => {
    const res = await http.post<CustomField>(`/projects/${projectId}/custom-fields`, data)
    return res.data
  },
  update: async (projectId: string, fieldId: string, data: Partial<CustomField>): Promise<CustomField> => {
    const res = await http.patch<CustomField>(`/projects/${projectId}/custom-fields/${fieldId}`, data)
    return res.data
  },
  delete: async (projectId: string, fieldId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/custom-fields/${fieldId}`)
  },
}

// Automation rules
export const automationRuleApi = {
  list: async (projectId: string): Promise<AutomationRule[]> => {
    const res = await http.get<AutomationRule[]>(`/projects/${projectId}/automation-rules`)
    return res.data
  },
  create: async (projectId: string, data: AutomationRuleCreate): Promise<AutomationRule> => {
    const res = await http.post<AutomationRule>(`/projects/${projectId}/automation-rules`, data)
    return res.data
  },
  update: async (projectId: string, ruleId: string, data: Partial<AutomationRule>): Promise<AutomationRule> => {
    const res = await http.patch<AutomationRule>(`/projects/${projectId}/automation-rules/${ruleId}`, data)
    return res.data
  },
  delete: async (projectId: string, ruleId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/automation-rules/${ruleId}`)
  },
}

// Project priorities
export const priorityApi = {
  listItems: async (projectId: string): Promise<PriorityItem[]> => {
    const res = await http.get<PriorityItem[]>(`/projects/${projectId}/priorities`)
    return res.data
  },
  createItem: async (projectId: string, name: string, color: string): Promise<PriorityItem> => {
    const res = await http.post<PriorityItem>(`/projects/${projectId}/priorities`, { name, color })
    return res.data
  },
  updateItem: async (projectId: string, itemId: string, data: { name?: string; color?: string }): Promise<PriorityItem> => {
    const res = await http.patch<PriorityItem>(`/projects/${projectId}/priorities/${itemId}`, data)
    return res.data
  },
  deleteItem: async (projectId: string, itemId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/priorities/${itemId}`)
  },
  reorderItems: async (projectId: string, orderedIds: string[]): Promise<PriorityItem[]> => {
    const res = await http.post<PriorityItem[]>(`/projects/${projectId}/priorities/reorder`, { ordered_ids: orderedIds })
    return res.data
  },
  assignScheme: async (projectId: string, schemeId: string): Promise<PriorityItem[]> => {
    const res = await http.put<PriorityItem[]>(`/projects/${projectId}/priorities/scheme`, { scheme_id: schemeId })
    return res.data
  },
  listGlobalSchemes: async (): Promise<PriorityScheme[]> => {
    const res = await http.get<PriorityScheme[]>('/priority-schemes')
    return res.data
  },
}

export const savedSearchApi = {
  list: async (projectId: string): Promise<SavedSearch[]> => {
    const res = await http.get<SavedSearch[]>(`/projects/${projectId}/saved-searches`)
    return res.data
  },
  create: async (projectId: string, data: SavedSearchCreate): Promise<SavedSearch> => {
    const res = await http.post<SavedSearch>(`/projects/${projectId}/saved-searches`, data)
    return res.data
  },
  update: async (projectId: string, searchId: string, data: SavedSearchUpdate): Promise<SavedSearch> => {
    const res = await http.patch<SavedSearch>(`/projects/${projectId}/saved-searches/${searchId}`, data)
    return res.data
  },
  delete: async (projectId: string, searchId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/saved-searches/${searchId}`)
  },
}

export const vcsApi = {
  providers: async (): Promise<import('../types').ProvidersInfo> => {
    const res = await http.get('/integrations/providers')
    return res.data
  },
  listConnections: async (projectId: string): Promise<import('../types').VcsConnection[]> => {
    const res = await http.get(`/projects/${projectId}/vcs-connections`)
    return res.data
  },
  createConnection: async (projectId: string, data: import('../types').VcsConnectionCreate): Promise<import('../types').VcsConnectionCreated> => {
    const res = await http.post(`/projects/${projectId}/vcs-connections`, data)
    return res.data
  },
  updateConnection: async (projectId: string, connectionId: string, settings: Record<string, string | null>): Promise<import('../types').VcsConnection> => {
    const res = await http.patch(`/projects/${projectId}/vcs-connections/${connectionId}`, { settings })
    return res.data
  },
  deleteConnection: async (projectId: string, connectionId: string): Promise<void> => {
    await http.delete(`/projects/${projectId}/vcs-connections/${connectionId}`)
  },
  deviceStart: async (projectId: string, connectionId: string): Promise<import('../types').DeviceStart> => {
    const res = await http.post(`/projects/${projectId}/vcs-connections/${connectionId}/device/start`)
    return res.data
  },
  devicePoll: async (projectId: string, connectionId: string, deviceCode: string): Promise<{ status: string; error?: string }> => {
    const res = await http.post(`/projects/${projectId}/vcs-connections/${connectionId}/device/poll`, { device_code: deviceCode })
    return res.data
  },
  devLinks: async (projectId: string, taskId: string): Promise<import('../types').TaskDevLink[]> => {
    const res = await http.get(`/projects/${projectId}/tasks/${taskId}/dev-links`)
    return res.data
  },
}
