export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface PriorityItem {
  id: string
  scheme_id: string
  name: string
  color: string
  position: number
}

export interface PriorityScheme {
  id: string
  name: string
  is_default: boolean
  project_id: string | null
  items: PriorityItem[]
}

export type IssueType = 'epic' | 'story' | 'task' | 'bug'

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface User {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  initials: string
  is_verified: boolean
  is_superuser?: boolean // REQ-155: gates the Instance Admin menu entry
  password_set_by_user?: boolean // false for SSO accounts until they set one
  created_at: string
}

// REQ-155: instance admin user row (superuser-only endpoint)
export interface AdminUser {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  is_verified: boolean
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export interface AdminUserList {
  users: AdminUser[]
  total: number
}

export interface UserProfileUpdate {
  username?: string
  first_name?: string
  last_name?: string
}

export type ProjectMode = 'open' | 'guided' | 'enforced'

// Display labels for modes. The enum value 'open' is kept internally (DB/API);
// only the user-facing label changed to 'Flow'.
export const MODE_LABELS: Record<ProjectMode, string> = {
  open: 'Flow',
  guided: 'Guided',
  enforced: 'Enforced',
}

export type StatusCategory = 'unstarted' | 'started' | 'completed' | 'cancelled'

export interface ProjectStatus {
  id: string
  project_id: string
  name: string
  color: string
  position: number
  category: StatusCategory
  is_default: boolean
  is_active: boolean
  allow_on_create?: boolean // 'curated' creation policy: valid birth status
  wip_limit: number | null
  created_at: string
  issue_type: IssueType | null
}

// Task-creation policy (Jira Create-transition model): any (Linear) /
// initial (Jira default) / curated (allow_on_create statuses only)
export type CreationStatusPolicy = 'any' | 'initial' | 'curated'

export interface ProjectStatusCreate {
  name: string
  color?: string
  category: StatusCategory
  is_default?: boolean
  issue_type?: IssueType | null
  wip_limit?: number | null
}

export interface ProjectStatusUpdate {
  name?: string
  color?: string
  category?: StatusCategory
  position?: number
  is_default?: boolean
  is_active?: boolean
  issue_type?: IssueType | null
  wip_limit?: number | null
  allow_on_create?: boolean
}

export interface TransitionRule {
  id: string
  project_id: string
  from_status_id: string
  to_status_id: string
  require_role: string | null
  is_active: boolean
  issue_type: IssueType | null
}

export interface TransitionRuleCreate {
  from_status_id: string
  to_status_id: string
  require_role?: string | null
  issue_type?: IssueType | null
}

export type EstimationMethod = 'none' | 'story_points' | 'flow' | 'baseline' | 'impact'

export type AutomationTrigger =
  | 'task_created' | 'status_changed'
  | 'pr_opened' | 'pr_merged' | 'pr_closed' | 'branch_created' | 'commit_pushed'
export interface AutomationAction { type: string; [k: string]: unknown }
export interface AutomationCondition { field: string; op?: string; value?: string }

export interface AutomationRule {
  id: string
  project_id: string
  name: string
  trigger: AutomationTrigger
  trigger_config: Record<string, unknown> | null
  conditions: AutomationCondition[] | null
  actions: AutomationAction[]
  enabled: boolean
  position: number
}

export interface AutomationRuleCreate {
  name: string
  trigger: AutomationTrigger
  trigger_config?: Record<string, unknown> | null
  conditions?: AutomationCondition[] | null
  actions: AutomationAction[]
  enabled?: boolean
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox'

export interface CustomField {
  id: string
  project_id: string
  name: string
  field_type: CustomFieldType
  options: string[] | null
  required: boolean
  position: number
}

export interface CustomFieldCreate {
  name: string
  field_type: CustomFieldType
  options?: string[] | null
  required?: boolean
}

// HW-18: how a new task's assignee is chosen when the creator doesn't pick one
export type DefaultAssigneeMode = 'unassigned' | 'creator' | 'member'

export interface Project {
  id: string
  name: string
  key: string
  owner_id: string
  mode: ProjectMode
  enforce_block_links: boolean
  creation_status_policy?: CreationStatusPolicy
  estimation_method: EstimationMethod
  hide_done_after_days: number | null
  auto_archive_after_days?: number | null // REQ-161
  // HW-18: default assignee for newly created tasks
  default_assignee_mode?: DefaultAssigneeMode
  default_assignee_id?: string | null
  priority_scheme_id: string | null
  created_at: string
  updated_at: string
}

export interface BoardFilterConfig {
  filters: Record<string, unknown>[]
}

export interface Board {
  id: string
  name: string
  project_id: string
  created_at: string
  filter_config?: BoardFilterConfig | null
}

export interface ParentTaskInfo {
  id: string
  title: string
  issue_type: IssueType
  status: TaskStatus
  sequence_number: number
  // HW-30: resolved custom status; the fixed `status` is stale in guided/enforced
  // projects. Absent in Flow projects — fall back to `status` then.
  custom_status_name?: string | null
  custom_status_category?: StatusCategory | null
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  issue_type: IssueType
  severity: SeverityLevel | null
  priority_id: string | null
  position: number
  grid_x: number | null
  grid_y: number | null
  project_id: string
  sequence_number: number
  project_key: string
  assignee_id: string | null
  start_date: string | null
  due_date: string | null
  parent_id: string | null
  sprint_id: string | null
  release_id: string | null
  custom_status_id: string | null
  estimate: number | null
  business_value: number | null
  custom_fields: Record<string, unknown> | null
  parent?: ParentTaskInfo | null
  version: number
  sub_tasks: SubTask[]
  tags: Tag[]
  created_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at?: string | null // REQ-161
  // HW-30: resolved custom status, sent by cross-project endpoints (My Work). Absent in
  // Flow projects and on endpoints that don't eager-load it — fall back to `status` then.
  custom_status_name?: string | null
  custom_status_category?: StatusCategory | null
}

export type MyWorkFacet = 'assigned' | 'created' | 'watching'

// REQ-148 — recurring tasks
export type RecurrenceCadence = 'daily' | 'weekly' | 'monthly'

export interface RecurringTask {
  id: string
  project_id: string
  template_id: string
  cadence: RecurrenceCadence
  weekday: number | null
  day_of_month: number | null
  next_run_at: string
  enabled: boolean
  created_by: string | null
  created_at: string
}

// REQ-147 — work logs
export interface WorkLog {
  id: string
  task_id: string
  user_id: string | null
  minutes: number
  note: string | null
  spent_on: string
  created_at: string
}

export interface WorkLogList {
  entries: WorkLog[]
  total_minutes: number
}

// REQ-143 — personal API tokens
export interface ApiToken {
  id: string
  name: string
  prefix: string
  scope: 'read' | 'write'
  created_at: string
  last_used_at: string | null
}

export interface ApiTokenCreated extends ApiToken {
  token: string
}

// REQ-144 — outbound webhooks
export type WebhookEvent =
  | 'task.created' | 'task.updated' | 'task.completed' | 'task.deleted'
  | 'comment.created' | 'sprint.closed'

export type WebhookFormat = 'json' | 'slack' | 'discord'

export interface OutboundWebhook {
  id: string
  project_id: string
  url: string
  events: WebhookEvent[]
  enabled: boolean
  format: WebhookFormat
  last_status: number | null
  last_delivery_at: string | null
  created_at: string
}

export interface OutboundWebhookCreated extends OutboundWebhook {
  secret: string
}

export interface SubTask {
  id: string
  title: string
  is_completed: boolean
  task_id: string
  created_at: string
}

export interface TaskCreate {
  title: string
  description?: string
  status?: TaskStatus
  issue_type?: IssueType
  severity?: SeverityLevel | null
  priority_id?: string | null
  // HW-18: null is meaningful — "explicitly nobody", distinct from an omitted key,
  // which lets the server apply the project default.
  assignee_id?: string | null
  due_date?: string
  custom_status_id?: string | null
  parent_id?: string | null
}

export interface TaskUpdate {
  title?: string
  status?: TaskStatus
  issue_type?: IssueType
  severity?: SeverityLevel | null
  priority_id?: string | null
  assignee_id?: string | null
  start_date?: string | null
  due_date?: string | null
  sprint_id?: string | null
  release_id?: string | null
  custom_status_id?: string | null
  parent_id?: string | null
  estimate?: number | null
  business_value?: number | null
  custom_fields?: Record<string, unknown> | null
  grid_x?: number | null
  grid_y?: number | null
  version: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  // Only sent when joining via an invite; the standard flow sets the password
  // at email verification instead.
  password?: string
  invite_token?: string
}

export interface VerifyEmailRequest {
  email: string
  code: string
  new_password: string
}

export interface RegisterResponse {
  message: string
  expires_in_minutes: number
  project_id?: string
  access_token?: string
}

export interface InviteMetadata {
  project_id: string
  workspace_name: string
  email: string
  expired: boolean
  used: boolean
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface ProjectMember {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  initials: string
  joined_at: string | null
  role: MemberRole
}

export interface ProjectInvite {
  id: string
  token: string
  project_id: string
  email: string
  used: boolean
  expires_at: string
  created_at: string
}

export interface Attachment {
  id: string
  task_id: string | null
  comment_id: string | null
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

// REQ-162: one emoji's tally on a comment
export interface ReactionAggregate {
  emoji: string
  count: number
  me: boolean
}

// Project custom reaction emote (Teams model) — referenced in reactions as ':name:'
export interface CustomEmote {
  id: string
  project_id: string
  name: string
  url: string
  created_by: string | null
  created_at: string
}

export interface Comment {
  id: string
  task_id: string
  author_id: string | null
  content: string
  created_at: string
  edited_at: string | null
  reactions?: ReactionAggregate[]
}

export interface CommentHistoryEntry {
  id: string
  comment_id: string
  content: string
  edited_by: string | null
  edited_at: string
}

export type NotificationType =
  | 'comment_added'
  | 'mentioned'
  | 'status_changed'
  | 'assignee_changed'
  | 'priority_changed'
  | 'task_deleted'
  | 'due_date_approaching'

export interface Notification {
  id: string
  project_id: string
  task_id: string | null
  type: NotificationType
  read: boolean
  payload: Record<string, unknown>
  created_at: string
}

export interface NotificationPreferences {
  on_comment: boolean
  on_mention: boolean
  on_status_change: boolean
  on_assignee_change: boolean
  on_priority_change: boolean
  on_due_date_approaching: boolean
  on_task_deleted: boolean
  due_date_reminder_hours: number
  email_enabled: boolean
}

export interface WatchStatus {
  watching: boolean
}

export interface ActivityEntry {
  id: number
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  project_id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogEntry {
  id: number
  project_id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface PaginatedAuditLog {
  items: AuditLogEntry[]
  total: number
  next_cursor: number | null
}

export type TagVisibility = 'private' | 'workspace'

export interface Tag {
  id: string
  project_id: string
  owner_id: string
  name: string
  color: string
  visibility: TagVisibility
  created_at: string
}

export type LinkType = 'blocks' | 'depends_on' | 'duplicates' | 'relates_to'

export interface LinkedTaskInfo {
  id: string
  title: string
  status: TaskStatus
  // HW-22: shown as "HW-22" on linked rows. Defaulted server-side, so a deleted
  // task's placeholder carries 0/'' rather than omitting them.
  sequence_number: number
  project_key: string
  // HW-30: resolved custom status; the fixed `status` is stale in guided/enforced
  // projects. Absent in Flow projects — fall back to `status` then.
  custom_status_name?: string | null
  custom_status_category?: StatusCategory | null
}

export interface TaskLink {
  id: string
  source_id: string
  target_id: string
  link_type: LinkType
  display_type: string
  linked_task: LinkedTaskInfo
  created_at: string
}

export interface TaskLinkCreate {
  target_id: string
  link_type: LinkType
}

export interface TaskTemplate {
  id: string
  project_id: string
  name: string
  title: string | null
  description: string | null
  issue_type: IssueType | null
  priority_id: string | null
  severity: SeverityLevel | null
  tag_ids: string[]
  position: number
}

export interface TaskTemplateCreate {
  name: string
  title?: string | null
  description?: string | null
  issue_type?: IssueType | null
  priority_id?: string | null
  severity?: SeverityLevel | null
  tag_ids?: string[]
}

export interface TaskSearchResult {
  id: string
  title: string
  status: TaskStatus
  sequence_number: number
  project_id?: string | null
  project_key: string
  // HW-30: resolved custom status; the fixed `status` is stale in guided/enforced
  // projects. Absent in Flow projects — fall back to `status` then.
  custom_status_name?: string | null
  custom_status_category?: StatusCategory | null
}

export type SprintStatus = 'planned' | 'active' | 'closed'

export interface Sprint {
  id: string
  project_id: string
  board_id: string | null
  name: string
  goal: string | null
  start_date: string
  end_date: string
  status: SprintStatus
  committed_points: number
  created_at: string
}

export type ReleaseStatus = 'planned' | 'released' | 'archived'

export interface Release {
  id: string
  project_id: string
  name: string
  description: string | null
  status: ReleaseStatus
  start_date: string | null
  release_date: string | null
  position: number
  created_at: string
  total_tasks: number
  done_tasks: number
  progress_pct: number
}

export interface ReleaseCreate {
  name: string
  description?: string | null
  status?: ReleaseStatus
  start_date?: string | null
  release_date?: string | null
}

export interface ReleaseUpdate {
  name?: string
  description?: string | null
  status?: ReleaseStatus
  start_date?: string | null
  release_date?: string | null
  position?: number
}

export interface VelocitySprintPoint {
  sprint_id: string
  name: string
  committed: number
  completed: number
}

export interface VelocityResponse {
  sprints: VelocitySprintPoint[]
  rolling_average: number
  suggested_capacity: number
}

export interface SprintReport {
  committed: number
  completed: number
  total: number
  scope_change: number
  carryover: number
  task_count: number
  completed_count: number
}

export interface BaselineNeighbor {
  title: string
  days: number
  similarity: number
}

export interface BaselinePrediction {
  enough_data: boolean
  predicted_days: number | null
  confidence: number | null
  elapsed_days: number | null
  surprise: boolean
  neighbors: BaselineNeighbor[]
}

export interface ForecastResponse {
  enough_data: boolean
  remaining: number
  throughput: number[]
  p50_weeks: number | null
  p85_weeks: number | null
  p95_weeks: number | null
  p50_date: string | null
  p85_date: string | null
  p95_date: string | null
}

export interface SprintCreate {
  name: string
  goal?: string
  start_date: string
  end_date: string
}

export interface SprintUpdate {
  name?: string
  goal?: string
  start_date?: string
  end_date?: string
}

export interface SprintCompleteRequest {
  incomplete_action: 'backlog' | 'move' | 'new'
  target_sprint_id?: string | null
  new_sprint_name?: string | null
}

export interface CycleConfig {
  project_id: string
  enabled: boolean
  duration_weeks: number
  cooldown_days: number
  start_anchor: string
  upcoming_count: number
}

export interface CycleConfigUpdate {
  enabled: boolean
  duration_weeks: number
  cooldown_days: number
  start_anchor: string
  upcoming_count: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface PriorityCount {
  priority_id: string | null
  priority_name: string
  count: number
}

export interface AssigneeCount {
  user_id: string
  name: string
  count: number
}

export interface ThroughputPoint {
  date: string
  created: number
  completed: number
}

export interface AgeDistributionBucket {
  label: string
  count: number
  max_days: number
}

export interface StatsResponse {
  by_status: StatusCount[]
  by_priority: PriorityCount[]
  by_assignee: AssigneeCount[]
  throughput: ThroughputPoint[]
  completion_rate: number
  completed_count: number
  created_count: number
  overdue_count: number
  by_age: AgeDistributionBucket[]
}

export interface BurndownPoint {
  date: string
  created: number
  completed: number
  remaining: number
}

export interface CFDPoint {
  date: string
  todo: number
  in_progress: number
  done: number
}

export interface TimeInStatusPoint {
  status: string
  avg_hours: number
  median_hours: number
  sample_count: number
}

export interface CycleTimePercentiles {
  p50: number
  p85: number
  p95: number
  unit: string
}

export interface CycleTimeScatterPoint {
  date: string
  lead_days: number
  cycle_days: number | null
}

export interface CycleTimeResponse {
  lead_time: CycleTimePercentiles | null
  cycle_time: CycleTimePercentiles | null
  scatter: CycleTimeScatterPoint[]
}

export interface SavedSearch {
  id: string
  project_id: string
  user_id: string
  name: string
  filters: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export interface SavedSearchCreate {
  name: string
  filters: Record<string, unknown>[]
}

export interface SavedSearchUpdate {
  name?: string
  filters?: Record<string, unknown>[]
}

// ── Git integration ──────────────────────────────────────────────────────────
export type VcsProvider = 'github' | 'gitlab' | 'bitbucket'

export interface VcsConnection {
  id: string
  project_id: string
  provider: VcsProvider
  repo_identifier: string
  base_url?: string | null
  settings?: Record<string, string | null> | null
  webhook_url: string
  connected: boolean
  created_at: string
}

export interface VcsConnectionCreated extends VcsConnection {
  webhook_secret: string
}

export interface VcsConnectionCreate {
  provider: VcsProvider
  repo_identifier: string
  base_url?: string | null
  token?: string | null
}

export interface ProvidersInfo {
  encryption_configured: boolean
  providers: Record<VcsProvider, { auth: 'device' | 'token'; device_flow: boolean }>
}

export interface DeviceStart {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

export interface TaskDevLink {
  id: string
  kind: 'branch' | 'commit' | 'pr'
  external_id: string
  number?: number | null
  title: string
  url: string
  state: 'open' | 'merged' | 'closed'
  author_login?: string | null
  created_at: string
  provider: VcsProvider | ''
  repo_identifier: string
}
