import { useEffect, useRef, useState } from 'react'

const SECTIONS = [
  { id: 'getting-started',    label: 'Getting Started' },
  { id: 'my-work',            label: 'My Work' },
  { id: 'project-modes',      label: 'Project Modes' },
  { id: 'issues',             label: 'Issues' },
  { id: 'board-views',        label: 'Board Views' },
  { id: 'statuses-workflows', label: 'Statuses & Workflows' },
  { id: 'sprints',            label: 'Sprints' },
  { id: 'roadmap-releases',   label: 'Roadmap & Releases' },
  { id: 'estimation',         label: 'Estimation' },
  { id: 'tags-filters',       label: 'Tags, Filters & Saved Searches' },
  { id: 'issues-export',      label: 'Issues Page & Export' },
  { id: 'collaboration',      label: 'Collaboration' },
  { id: 'git-integration',    label: 'Git Integration' },
  { id: 'api-webhooks',       label: 'API & Webhooks' },
  { id: 'members-roles',      label: 'Members & Roles' },
  { id: 'search',             label: 'Search' },
  { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts' },
  { id: 'reports',            label: 'Reports' },
]

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {children}
    </span>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 mb-14">
      <h2 className="text-xl font-bold text-gray-100 mb-4 pb-2 border-b border-gray-800">{title}</h2>
      {children}
    </section>
  )
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-gray-200 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 leading-relaxed mb-2">{children}</p>
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 text-sm text-gray-400 mb-2">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            {headers.map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/60 hover:bg-gray-800/30">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 text-gray-400 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-800 text-brand px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
}

function Example({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-lg border-l-2 border-brand/60 bg-gray-900/60 pl-3 pr-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand/80 mb-1">Example</p>
      <div className="text-sm text-gray-400 space-y-1.5">{children}</div>
    </div>
  )
}

export default function HelpPage() {
  const [activeId, setActiveId] = useState('getting-started')
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Deep links (e.g. /help#project-modes from the create-project dialog) — scroll
  // to the hashed section once the page has painted.
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    const t = setTimeout(() => {
      const el = document.getElementById(hash)
      if (el) {
        el.scrollIntoView()
        setActiveId(hash)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex max-w-6xl mx-auto w-full min-w-0 px-6 py-8 gap-10">
        {/* Table of contents — hidden on phones, where it would leave the docs
            column ~80px wide; sections are still reachable by scrolling. */}
        <aside className="hidden md:block w-52 flex-shrink-0">
          <nav className="sticky top-8 space-y-0.5">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3 px-2">Contents</p>
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  activeId === id
                    ? 'bg-brand/10 text-brand font-medium'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-100 mb-8">Help & Documentation</h1>

          {/* ── Getting Started ─────────────────────────────────────────── */}
          <Section id="getting-started" title="Getting Started">
            <P>
              Orbit is a project management tool built around the concept of <strong className="text-gray-200">Projects</strong> — each
              project has its own boards, members, statuses, and settings. Everything lives inside a project.
            </P>
            <Sub title="Basic navigation">
              <Ul items={[
                <><strong className="text-gray-300">Project selector</strong> (top-left) — switch between projects. Creating projects is reserved for the instance admin; everyone else joins by invite.</>,
                <><strong className="text-gray-300">Board tabs</strong> — each project can have multiple boards (e.g. Frontend, Backend). Switch between them at the top.</>,
                <><strong className="text-gray-300">Views</strong> — toggle between Kanban, List, Calendar and Gantt using the toolbar icons.</>,
                <><strong className="text-gray-300">Header icons</strong> — Members, Audit Log, Project Settings, Notifications, and your avatar are always in the top-right.</>,
              ]} />
            </Sub>
            <Sub title="Who can manage what">
              <Ul items={[
                <>Renaming or deleting a <strong className="text-gray-200">project</strong>, and creating, renaming, or deleting <strong className="text-gray-200">boards</strong>, is for project <strong className="text-gray-200">admins</strong> — the controls only appear if you hold the admin role (or own the project).</>,
                <>Creating a <strong className="text-gray-200">new project</strong> is for the <strong className="text-gray-200">instance admin</strong> only. If you just registered and see no projects, ask your admin for an invite.</>,
              ]} />
            </Sub>
            <Sub title="Creating your first task">
              <P>Click the <Code>+</Code> button on any column (Kanban) or use the keyboard shortcut <Code>C</Code> to open the create task form. Fill in the title — everything else is optional.</P>
              <P>The title (summary) is limited to <strong className="text-gray-200">100 characters</strong> — a live counter appears from 80 on, and going over shows the exact count so you can trim. Long detail belongs in the description, which has no limit.</P>
            </Sub>

            <Sub title="Migrating from another tracker (CSV import)">
              <P>
                Admins can bulk-import tasks in <strong className="text-gray-200">Project Settings → Integrations → Import tasks (CSV)</strong>.
                The file needs a header row; recognised columns: <Code>title</Code> (required), <Code>description</Code>,{' '}
                <Code>status</Code> (todo / in_progress / done), <Code>issue_type</Code> (task / bug / story / epic), <Code>due_date</Code> (ISO date).
                Unknown columns are ignored. Max 500 rows per file — bad rows are skipped and listed with their row number, never aborting the rest.
              </P>
              <P>Most trackers (Jira, YouTrack, Trello) export CSV — rename their columns to match and import.</P>
            </Sub>

            <Sub title="Password changes & resets (REQ-154)">
              <P><strong className="text-gray-200">Logged in?</strong> Change your password in <strong className="text-gray-200">Preferences → Profile → Change password</strong> — it requires your current password, so a hijacked session can't lock you out.</P>
              <P><strong className="text-gray-200">Locked out?</strong> On the login page click <strong className="text-gray-200">Forgot password?</strong>, enter your email, and a <strong className="text-gray-200">6-digit reset code</strong> is sent (check MailHog at <Code>localhost:8025</Code> in dev). Enter the code with a new password and you're back in.</P>
              <Ul items={[
                'Both flows revoke all other sessions and send a confirmation email.',
                <>Both offer an <strong className="text-gray-200">"Also revoke my API tokens"</strong> checkbox — off by default so scripts keep working; turn it on if you suspect compromise, and any token an attacker planted dies with the sessions.</>,
                'The forgot-password response never reveals whether an email is registered — no account enumeration.',
                'Instance admins can also trigger a reset code for any user from the Instance Admin page.',
              ]} />
            </Sub>

            <Sub title="Signing in with Google">
              <P>
                If your Orbit operator configured Google SSO, the login page shows a real{' '}
                <strong className="text-gray-200">Sign in with Google</strong> button. First sign-in creates your account
                automatically (no email verification round-trip — Google already verified you).
                Self-hosting note: set <Code>GOOGLE_OAUTH_CLIENT_ID</Code> to enable it; unset hides the button.
              </P>
            </Sub>

            <Sub title="Dashboard">
              <P>
                The <strong className="text-gray-200">Dashboard</strong> (grid icon in the header, or <Code>Cmd+K</Code> → "Go to Dashboard")
                is your personal wall of charts: add Burndown, Cumulative Flow, Time in Status or Velocity widgets from any
                project you belong to, in any combination. The layout is saved per browser — it's yours, not shared.
              </P>
            </Sub>
          </Section>

          {/* ── My Work ─────────────────────────────────────────────────── */}
          <Section id="my-work" title="My Work">
            <P>
              <strong className="text-gray-200">My Work</strong> (person icon in the header, or <Code>Cmd+K</Code> → “Go to My Work”)
              is your personal list across <strong className="text-gray-200">all projects</strong> you belong to — unlike a board,
              which always shows one project. Three tabs:
            </P>
            <Ul items={[
              <><strong className="text-gray-200">Assigned to me</strong> — every open and done task where you are the assignee.</>,
              <><strong className="text-gray-200">Created by me</strong> — tasks you created (recorded automatically at creation).</>,
              <><strong className="text-gray-200">Watching</strong> — tasks you subscribed to via Watch.</>,
            ]} />
            <P>
              Rows are ordered by due date (tasks without one sink to the bottom); overdue tasks are highlighted and counted
              in the header badge. Clicking a row opens the task in its own project. The active tab is shareable via
              the <Code>?facet=</Code> URL parameter.
            </P>
          </Section>

          {/* ── Project Modes ───────────────────────────────────────────── */}
          <Section id="project-modes" title="Project Modes">
            <P>
              The single most important setting in Orbit. A project's <strong className="text-gray-200">mode</strong> controls how statuses work,
              whether workflow rules are enforced, and how much structure you impose on your team.
              You change it in <strong className="text-gray-200">Project Settings → Mode</strong>.
            </P>

            <Sub title={<span className="flex items-center gap-2">Flow mode <Badge color="bg-gray-700 text-gray-300">default</Badge></span> as any}>
              <P>Three fixed statuses: <Code>To Do</Code>, <Code>In Progress</Code>, <Code>Done</Code>. No configuration required.</P>
              <P>Best for: small teams, personal projects, or anyone who wants to move fast without defining a workflow upfront.</P>
              <Ul items={[
                'Statuses cannot be renamed or reordered.',
                'Tasks move freely between any status — no rules.',
                'No board filter — every member sees all tasks; only personal filters apply.',
                'Ideal starting point before you understand your workflow.',
              ]} />
            </Sub>

            <Sub title={<span className="flex items-center gap-2">Guided mode <Badge color="bg-blue-900/60 text-blue-300">customizable</Badge></span> as any}>
              <P>You define your own statuses (name, color, category). Each status maps to one of four categories: <Code>Unstarted</Code>, <Code>Started</Code>, <Code>Completed</Code>, <Code>Cancelled</Code>.</P>
              <P>Best for: teams with a defined workflow (e.g. Backlog → Design → Dev → QA → Done) who don't need strict enforcement.</P>
              <Ul items={[
                'Create, reorder, and color-code statuses in Project Settings → Statuses.',
                'Tasks still move freely between any status — no rules enforced.',
                'The kanban board shows one column per active status.',
                'Statuses are shared across all boards in the project.',
                'Admins can set a board filter (the default scope). Members see it applied by default and can disable it or reset back to it.',
              ]} />
            </Sub>

            <Sub title={<span className="flex items-center gap-2">Enforced mode <Badge color="bg-purple-900/60 text-purple-300">strict</Badge></span> as any}>
              <P>Everything from Guided, plus <strong className="text-gray-200">Transition Rules</strong>. A task can only move to statuses that are explicitly allowed from its current status.</P>
              <P>Best for: regulated workflows, QA gates, or any process where skipping steps causes problems.</P>
              <Ul items={[
                'Define allowed transitions in Project Settings → Transitions.',
                'The status picker in task detail only shows valid next statuses.',
                'Attempting an invalid transition via drag-and-drop is blocked.',
                'Each transition rule is directional: "From A → To B".',
                'The board filter is locked: members can only narrow within it — tasks outside it are hidden and cannot be revealed.',
              ]} />
            </Sub>

            <Sub title="Board filter (admin-set scope)">
              <P>
                Each board has two independent filter layers, composed with AND. The <strong className="text-gray-200">board filter</strong> is
                set by an admin and defines the board's scope; your <strong className="text-gray-200">personal filter</strong> (the bar with the
                slider icon) narrows further on top of it. You can never see tasks the board filter excludes — you can only narrow within it.
              </P>
              <P>Admins edit it from the board itself: the <strong className="text-gray-200">Board filter</strong> row above the filter bar has a pencil (✎) to set or change it. Its behavior depends on mode:</P>
              <Ul items={[
                'Flow — no board filter exists.',
                'Guided — applied as a default you can disable (eye-off) and reset back to (↺). Your choice is remembered per board.',
                'Enforced — locked (🔒) and non-removable. You can only add narrower personal filters within it.',
              ]} />
              <P>Note: like all board filtering in Orbit, this is applied in the browser for display — it scopes what you see, it is not a server-side access boundary.</P>
            </Sub>

            <Sub title="Giving a board its own columns">
              <P>
                Filtering a board on <strong className="text-gray-200">Status</strong> does something the other fields don't: it changes which
                <strong className="text-gray-200"> columns the board renders</strong>, not just which cards appear. This is how one project runs
                several boards that look nothing alike — a <em>Delivery</em> board showing To&nbsp;Do / In&nbsp;Progress / Done, and a
                <em> Research</em> board next to it showing only Research / Conclude.
              </P>
              <P>Set it the same way as any board filter: the pencil (✎) on the <strong className="text-gray-200">Board filter</strong> row, then add Status entries.</P>
              <Ul items={[
                'Pick one or more statuses and the board renders only those columns, in the project\'s status order.',
                <>Negate one (<strong className="text-gray-200">NOT</strong>) and that column is dropped instead — useful for a board that is "everything except Done".</>,
                'Leave Status out of the filter entirely and the board shows every column, as before.',
              ]} />
              <P>
                Statuses themselves stay <strong className="text-gray-200">project-level</strong>. A board is a view, not an owner — it never
                creates, renames or deletes a status, it only chooses which of the project's statuses to display. Editing statuses is still done
                once, in <strong className="text-gray-200">Project Settings → Statuses</strong>, and every board picks from that same list.
              </P>
              <P>Two consequences worth knowing:</P>
              <Ul items={[
                'A task moved to a status this board does not show is not lost — it stays on the project and still appears on other boards, the Issues page and search. It simply is not rendered here.',
                'A status filter that matches no columns at all falls back to showing every column, rather than leaving you staring at an empty board.',
              ]} />
              <P>Available in Guided and Enforced only, since Flow has no board filter.</P>
            </Sub>

            <Sub title="Task creation policy">
              <P>Which statuses can a task be <em>born</em> in? Set per project in <strong className="text-gray-200">Project Settings → Mode → Task creation</strong>:</P>
              <Ul items={[
                <><strong className="text-gray-200">Any status</strong> — create directly into any column, Linear-style. The default for Flow and Guided.</>,
                <><strong className="text-gray-200">Initial only</strong> — every new task lands on the workflow's initial status (Jira's default Create transition), whatever column you clicked + on. The default for Enforced — otherwise "no skipping steps" could be bypassed by creating a task straight into Done.</>,
                <><strong className="text-gray-200">Curated</strong> — admins tick exactly which statuses are valid at creation; anything else is rejected.</>,
              ]} />
              <P>Switching modes resets the policy to the new mode's default. Tracker imports (admin bulk) keep their status mapping regardless — migrated history stays intact. In Enforced mode, a task that has no custom status yet (imported or created before the switch) is treated as sitting on the initial status, so it still has to walk the approved path.</P>
            </Sub>

            <Sub title="Switching modes">
              <P>You can switch modes at any time. When switching to Guided or Enforced, existing tasks retain their current status — no remapping needed. Switching back to Flow maps all custom statuses to their closest fixed equivalent by category (Completed/Cancelled → Done, Started → In Progress, Unstarted → To Do). Switching to Enforced seeds a default linear workflow (consecutive statuses + re-open rules) if no transition rules exist yet.</P>
            </Sub>

            <Table
              headers={['', 'Flow', 'Guided', 'Enforced']}
              rows={[
                ['Custom statuses', '✗', '✓', '✓'],
                ['Transition rules', '✗', '✗', '✓'],
                ['Free movement', '✓', '✓', '✗'],
                ['Board filter', '—', 'Default (toggleable)', 'Locked'],
                ['Setup required', 'None', 'Statuses', 'Statuses + Rules'],
              ]}
            />
          </Section>

          {/* ── Issues ──────────────────────────────────────────────────── */}
          <Section id="issues" title="Issues">
            <P>Every task in Orbit is an <strong className="text-gray-200">issue</strong>. Issues have a type, status, priority, assignee, due date, and can have child issues, tags, attachments, comments, and watchers.</P>

            <Sub title="Issue types">
              <Table
                headers={['Type', 'Intended use']}
                rows={[
                  [<Badge color="bg-purple-900/60 text-purple-300">Epic</Badge>, 'Large body of work spanning multiple sprints. Contains child Stories or Tasks.'],
                  [<Badge color="bg-blue-900/60 text-blue-300">Story</Badge>, 'A user-facing feature or requirement. Usually fits in one sprint.'],
                  [<Badge color="bg-gray-700 text-gray-300">Task</Badge>, 'A unit of work. Default type.'],
                  [<Badge color="bg-red-900/60 text-red-300">Bug</Badge>, 'Something broken that needs fixing.'],
                ]}
              />
              <P>Issue type affects both visuals and hierarchy rules. Parent-child type validation is always enforced: an Epic cannot have a parent; a Story can only nest under an Epic; Tasks and Bugs can nest under an Epic or Story. In Enforced mode, additional gates apply — Stories must link to a parent Epic before moving to In Progress or Done; Bugs must have severity set before In Progress.</P>
            </Sub>

            <Sub title="Parent-child hierarchy">
              <P>Only <strong className="text-gray-200">Epics</strong> and <strong className="text-gray-200">Stories</strong> can have children — Tasks and Bugs are leaf nodes. Open an Epic or Story, scroll to <strong className="text-gray-200">Child Tasks</strong>, type a title and press Enter. The child is a full board task — it appears in its own status column on the board.</P>
              <Ul items={[
                'Parent cards show a ↓ N badge counting direct children.',
                'Child cards show a ↑ PROJ-N badge identifying the parent.',
                'Clicking the parent badge in a task\'s detail sidebar navigates to the parent.',
                'The hierarchy is at most three levels deep — Epic → Story → Task/Bug — because the type rules above only allow Epics and Stories as parents.',
              ]} />
            </Sub>

            <Sub title="Issue identifier">
              <P>Every issue gets a permanent identifier like <Code>ORB-42</Code> — project key + sequence number. Identifiers never change, never get reused.</P>
            </Sub>

            <Sub title="Templates">
              <P>A <strong className="text-gray-200">template</strong> is a reusable preset that prefills a new task. Admins create them in <strong className="text-gray-200">Project Settings → Templates</strong>; anyone creating a task picks one from the <strong className="text-gray-200">Template</strong> dropdown at the top of the new-task form. Available in every mode.</P>
              <Ul items={[
                'A template can prefill the title, description, issue type, priority, severity, and tags.',
                'Picking a template only fills the fields it sets — anything you\'ve already typed is kept, and you can edit everything before creating.',
                'Tags carried by the template are applied to the new task automatically.',
              ]} />
              <Example>
                <P>A support team defines a <strong className="text-gray-300">Bug report</strong> template: type <Code>bug</Code>, severity <Code>high</Code>, a description with "Steps / Expected / Actual" headings, and the <Code>triage</Code> tag. Now every bug starts consistent and pre-tagged — one dropdown pick instead of six fields.</P>
              </Example>
            </Sub>

            <Sub title="Recurring tasks">
              <P>
                A template can also run on a schedule: in <strong className="text-gray-200">Project Settings → Templates → Recurring tasks</strong>,
                pick a template and a cadence — <strong className="text-gray-200">daily</strong>, <strong className="text-gray-200">weekly</strong> (choose the weekday)
                or <strong className="text-gray-200">monthly</strong> (choose the day; the 31st safely becomes the last day of shorter months).
                Orbit creates the task automatically and it behaves like any other: board, notifications, webhooks.
              </P>
              <Ul items={[
                'Each schedule shows its next run date and can be paused with the enabled toggle.',
                'The created task\'s "created by" is the admin who set up the schedule.',
                'Deleting the template removes its schedules.',
              ]} />
            </Sub>

            <Sub title="Priority">
              <P>Every project has a <strong className="text-gray-200">priority scheme</strong> — a named, ordered list of priority levels. The default scheme ships with five levels:</P>
              <Table
                headers={['Level', 'Color', 'When to use']}
                rows={[
                  ['Show-stopper', <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />, 'Production down, data loss, security incident. Everything stops.'],
                  ['Critical', <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />, 'Core feature broken, no workaround. Fix this sprint.'],
                  ['Major', <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />, 'Standard work. Default for new tasks.'],
                  ['Minor', <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />, 'Nice to have, can wait for a future sprint.'],
                  ['Trivial', <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-500" />, 'Cosmetic. No real user impact.'],
                ]}
              />
              <P>Priorities are <strong className="text-gray-200">optional</strong> — a task with no priority set is simply unclassified. Set priority in the task detail sidebar.</P>
              <Sub title="Customizing priorities">
                <P>Admins can customize priority levels per project in <strong className="text-gray-200">Project Settings → Priorities</strong>. The first edit forks the global scheme into a project-local copy so other projects are unaffected.</P>
                <Table
                  headers={['Mode', 'Priority behavior']}
                  rows={[
                    [<Badge color="bg-gray-700 text-gray-300">Flow</Badge>, 'Admins can add, rename, recolor, or reorder levels. First edit forks the global scheme into a project-local copy so other projects are unaffected.'],
                    [<Badge color="bg-blue-900/60 text-blue-300">Guided</Badge>, 'Admins can add, rename, recolor, or reorder levels. First edit forks the scheme into a project-local copy.'],
                    [<Badge color="bg-purple-900/60 text-purple-300">Enforced</Badge>, 'Same as Guided. Forked scheme is fully customizable.'],
                  ]}
                />
              </Sub>
            </Sub>

            <Sub title="Linked issues">
              <P>Tasks can be linked to express relationships. Every issue is identified by its <strong className="text-gray-200">key</strong> — the project key plus its number, like <Code>HW-22</Code> — and the key is shown beside the title in the link search box and on each linked row, so you can pick the issue you mean by number rather than by reading titles.</P>
              <Ul items={[
                <><Code>blocks</Code> / <Code>is blocked by</Code> — this task must be done before another can proceed. A warning banner appears on blocked tasks.</>,
                <><Code>duplicates</Code> / <Code>is duplicated by</Code> — same work tracked twice.</>,
                <><Code>relates to</Code> — loosely related, no enforcement.</>,
              ]} />
              <P>Link enforcement varies by project mode:</P>
              <Table
                headers={['Mode', 'blocks', 'duplicates / relates to']}
                rows={[
                  [
                    <Badge color="bg-gray-700 text-gray-300">Flow</Badge>,
                    'Soft warning. A confirm dialog appears when moving a blocked task to Done — you can override it.',
                    'Visual only. No enforcement.',
                  ],
                  [
                    <Badge color="bg-blue-900/60 text-blue-300">Guided</Badge>,
                    'Same soft warning as Flow. Links are informational.',
                    'Visual only. No enforcement.',
                  ],
                  [
                    <Badge color="bg-purple-900/60 text-purple-300">Enforced</Badge>,
                    'Soft warning by default. Admin can enable hard-block in Project Settings → Mode → "Hard-block tasks with unresolved blockers from being marked Done". When on: no override, backend rejects the move too.',
                    'Visual only. No enforcement.',
                  ],
                ]}
              />
            </Sub>

            <Sub title="Clone & move (REQ-156)">
              <P>Both actions live in the <strong className="text-gray-200">⋯ menu</strong> on the task detail view — the same place Jira and YouTrack put them.</P>
              <Ul items={[
                <><strong className="text-gray-200">Clone task</strong> — duplicates the task in the same project: title, description, type, priority, dates, estimate, custom fields, tags, and subtasks. The clone starts fresh in the todo column with a new ticket number; comments, work logs, attachments, and watchers are not copied.</>,
                <><strong className="text-gray-200">Move to project…</strong> — relocates the task to another project you're a member of (viewer access isn't enough). Comments, attachments, work logs, and watchers travel with it. The task gets a new ticket number in the target; sprint and release assignments are cleared, its status maps to the target's matching status category, tags carry over only where the target has a same-named tag, and links to other tasks are removed.</>,
                'Subtasks move together with their parent. A task whose children have children of their own refuses to move — flatten the nesting first.',
                'Direct links to a task keep working after a move; only the human-readable ticket number changes.',
              ]} />
            </Sub>

            <Sub title="Promote a subtask (REQ-164)">
              <P>When a subtask outgrows its parent — it needs its own assignee, sprint slot, or children — hover it in the parent's <strong className="text-gray-200">Subtasks</strong> list and click the <strong className="text-gray-200">↗ arrow</strong> (Promote to standalone task).</P>
              <Ul items={[
                'The task keeps everything: its ticket number, status, description, comments, and history. Promotion just detaches it from the parent.',
                <>A <strong className="text-gray-200">relates_to</strong> link back to the old parent is created automatically, so the origin stays traceable.</>,
                'Both tasks record the promotion in their Activity feeds.',
                'To re-attach later, set the parent again from the task detail sidebar.',
              ]} />
            </Sub>

            <Sub title="Archiving tasks (REQ-161)">
              <P>Archiving clears finished work out of the way <strong className="text-gray-200">without deleting it</strong>. A Done task can be archived from its <strong className="text-gray-200">⋯ menu → Archive</strong> — it disappears from boards, search, stats, and My Work, but keeps all its data.</P>
              <Ul items={[
                <>Find archived tasks in the <strong className="text-gray-200">Issues page → Archived</strong> view (header list icon, or press <Code>I</Code>). Unarchive restores the task to the board and re-indexes it in search.</>,
                <>Set <strong className="text-gray-200">auto-archive</strong> in Project Settings: Done tasks older than N days are swept hourly. Leave it empty for manual-only.</>,
                'Archive is reversible; delete is not. Prefer archiving for anything you might need to reference.',
                <>API: <Code>?include_archived=true</Code> on the project task list includes them.</>,
              ]} />
            </Sub>

            <Sub title="Epic behavior by project mode">
              <P>Epics behave differently depending on the project mode:</P>
              <Table
                headers={['Mode', 'Epic behavior']}
                rows={[
                  [
                    <Badge color="bg-gray-700 text-gray-300">Flow</Badge>,
                    'Automatic rollup. When every direct child task reaches Done, the Epic is automatically set to Done — no manual action needed.',
                  ],
                  [
                    <Badge color="bg-blue-900/60 text-blue-300">Guided</Badge>,
                    'First-class workflow item. The Epic moves through your custom statuses like any other task. Parent-child is for grouping only — no extra rules.',
                  ],
                  [
                    <Badge color="bg-purple-900/60 text-purple-300">Enforced</Badge>,
                    'Completion gate. An Epic cannot be moved to a Completed or Cancelled status while it has incomplete child tasks. A confirmation dialog is shown if you try — you can override it explicitly.',
                  ],
                ]}
              />
            </Sub>

            <Sub title="Story, Task, Bug behavior by mode">
              <P>Story, Task, and Bug issue types also change behavior depending on the project mode:</P>
              <Table
                headers={['Type', 'Flow', 'Guided', 'Enforced']}
                rows={[
                  [
                    <Badge color="bg-green-900/60 text-green-300">Story</Badge>,
                    'Icon + color only. Moves freely.',
                    'Description editor shows an acceptance criteria template.',
                    'Must be linked to a parent Epic before moving to In Progress or Done. A dialog blocks the transition if no Epic is set.',
                  ],
                  [
                    <Badge color="bg-gray-700 text-gray-300">Task</Badge>,
                    'Icon + color only.',
                    'Plain — no template.',
                    'No extra constraints beyond configured transition rules.',
                  ],
                  [
                    <Badge color="bg-red-900/60 text-red-300">Bug</Badge>,
                    'Icon + color only.',
                    'Description editor shows a repro-steps / expected / actual template.',
                    'Severity must be set before the Bug can be moved to In Progress. The severity field (Low / Medium / High / Critical) appears in the task sidebar.',
                  ],
                ]}
              />
            </Sub>
          </Section>

          {/* ── Board Views ─────────────────────────────────────────────── */}
          <Section id="board-views" title="Board Views">
            <P>Four views, same data, different lenses. Toggle using the icons in the toolbar.</P>

            <Sub title="Kanban">
              <P>One column per status. Drag tasks between columns to change status. The <Code>+</Code> on each column creates a task in that status. Columns can be collapsed individually.</P>
              <P><strong className="text-gray-200">Swimlanes — Group by:</strong> Use the "Group by" dropdown in the toolbar to arrange tasks into swimlane rows. Available groupings:</P>
              <Ul items={[
                'None (default) — flat columns, no swimlanes.',
                'Assignee — one swimlane per team member, plus an Unassigned row.',
                'Priority — rows ordered by priority level.',
                'Type — grouped by issue type (Task, Bug, Story, etc.).',
                'Epic — grouped by parent/epic task.',
              ]} />
              <P>Each swimlane header can be collapsed. Swimlane rows are independent — the same column structure repeats in every row. Drag tasks between any row and column combination.</P>
              <P><strong className="text-gray-200">WIP limits:</strong> Set a Work-In-Progress limit on any custom status in Project Settings → Statuses. When a column's task count reaches the limit the badge turns red (<Code>count/limit</Code>). Exceeding the limit is allowed but the visual cue signals overload.</P>
              <P><strong className="text-gray-200">Bulk selection:</strong> Hover any task card to reveal a checkbox in the top-left corner. Check one or more tasks to activate the floating action bar at the bottom of the screen. Available bulk actions: move to To Do, move to In Progress, move to Done, or delete all selected tasks. Click elsewhere or press <Code>Esc</Code> to clear the selection.</P>
            </Sub>

            <Sub title="Done column cleanup">
              <P>
                <strong className="text-gray-200">New projects start with a 14-day cleanup</strong>; projects created before the feature default to Off.
                A project admin can change it anytime in
                {' '}<strong className="text-gray-200">Project Settings → Mode → Done column cleanup</strong>: pick Off, 7, 14, 30 or 90 days,
                and tasks completed longer ago than that disappear from the board's default view.
              </P>
              <Ul items={[
                <>Hiding is keyed to <strong className="text-gray-200">when the task was completed</strong> — editing a done task's title, tags or other fields does not bring it back or reset the clock.</>,
                <>Hidden means hidden <strong className="text-gray-200">from the board only</strong>. The tasks remain in search, the Backlog, reports, exports and statistics — nothing is deleted or archived.</>,
                <>Every user gets a <strong className="text-gray-200">"Show older completed tasks"</strong> button at the bottom of the Done column to temporarily reveal them. The peek is personal and per-session; it doesn't change what teammates see.</>,
                <>Moving a hidden task back to an unfinished status clears its completion time and returns it to the board permanently.</>,
              ]} />
            </Sub>

            <Sub title="List">
              <P>Sortable table. Click any underlined column header (Title, Status, Due Date) to sort ascending; click again to reverse; click a third time to clear sorting.</P>
              <P><strong className="text-gray-200">Inline cell editing:</strong> Click directly on a cell to edit it in-place without opening the task detail modal.</P>
              <Ul items={[
                'Title — text input. Press Enter or click away to save; Escape to cancel.',
                'Status — dropdown (Flow mode only; custom statuses are read-only in the list).',
                'Assignee — dropdown of project members; includes an Unassigned option.',
                'Due Date — native date picker.',
              ]} />
              <P>Bulk selection from Kanban also applies here — selected task badges carry over between views.</P>
            </Sub>

            <Sub title="Calendar">
              <P>Tasks are pinned to their due date. Toggle between three sub-views using the Month / Week / Day buttons in the top-left corner.</P>
              <Ul items={[
                'Month — 6-week grid. Up to 3 task pills per cell; +N overflow badge.',
                'Week — 7-column view for the current week with navigation arrows.',
                'Day — single day focus. Tasks due that day listed top; unscheduled tasks shown at the bottom for drag-assignment.',
              ]} />
              <P><strong className="text-gray-200">Drag-to-reschedule:</strong> Drag any task pill to a different day cell to update its due date. In Day view, drag an unscheduled task from the bottom shelf onto the main area to assign a date. Tasks without a due date do not appear in Month or Week views.</P>
            </Sub>

            <Sub title="Gantt">
              <P>Horizontal bar chart mapping tasks on a timeline. Each bar spans <Code>start_date → due_date</Code>. Falls back to <Code>created_at → today</Code> when dates are missing.</P>
              <P><strong className="text-gray-200">Zoom levels:</strong> Use the Day / Week / Month toggle in the toolbar to change time scale. Day shows individual dates; Week groups by week; Month gives the highest-level overview.</P>
              <P><strong className="text-gray-200">Drag to move:</strong> Grab the body of any bar and drag left or right to shift both start and end dates by the same amount.</P>
              <P><strong className="text-gray-200">Drag to resize:</strong> Drag the thin handle on the left edge of a bar to move the start date; drag the right edge to move the due date. The bar label shows the current duration in days while dragging.</P>
              <P><strong className="text-gray-200">Dependency arrows:</strong> If any task links of type "blocks" or "depends on" exist, red bezier arrows are drawn between the end of the blocking task and the start of the blocked task. Arrows appear in a non-interactive SVG overlay on top of the grid.</P>
            </Sub>

            <Sub title="Saved view state per board">
              <P>Every board independently remembers its own view configuration. When you switch boards, each board picks up exactly where you left off. Persisted per board:</P>
              <Ul items={[
                'Swimlane grouping (None / Assignee / Priority / Type / Epic)',
                'Active filter bar filters',
                'Collapsed columns',
              ]} />
              <P>State is saved to <Code>localStorage</Code> automatically on every change — no save button required. This makes boards useful as named workspaces: one board filtered to your epic, another to your team\'s active sprint, each with its own layout.</P>
            </Sub>

            <Sub title="Feature availability by mode">
              <Table
                headers={['Feature', 'Flow', 'Guided', 'Enforced']}
                rows={[
                  ['Fixed statuses (To Do / In Progress / Done)', '✓', '—', '—'],
                  ['Custom statuses (Kanban columns)', '—', '✓', '✓'],
                  ['WIP limits on columns', '—', '✓', '✓'],
                  ['Transition rules (validated status moves)', '—', '—', '✓'],
                  ['Swimlane grouping', '✓', '✓', '✓'],
                  ['Bulk selection + action bar', '✓', '✓', '✓'],
                  ['List inline editing — status', '✓ (fixed only)', '—', '—'],
                  ['List inline editing — title/assignee/due date', '✓', '✓', '✓'],
                  ['Calendar drag-to-reschedule', '✓', '✓', '✓'],
                  ['Gantt drag-to-move / resize', '✓', '✓', '✓'],
                  ['Gantt dependency arrows', '✓', '✓', '✓'],
                  ['Filter: status (fixed)', '✓', '—', '—'],
                  ['Filter: status (custom)', '—', '✓', '✓'],
                  ['Filter: epic / sprint / severity / due / priority', '✓', '✓', '✓'],
                  ['Saved searches', '✓', '✓', '✓'],
                  ['Per-board saved view state', '✓', '✓', '✓'],
                ]}
              />
            </Sub>
          </Section>

          {/* ── Statuses & Workflows ────────────────────────────────────── */}
          <Section id="statuses-workflows" title="Statuses & Workflows">
            <P>Available in <strong className="text-gray-200">Guided and Enforced</strong> modes only. Found under Project Settings → Statuses.</P>
            <P>
              Statuses are defined once for the whole project, but each board can choose which of them to show as columns — see
              <strong className="text-gray-200"> Project Modes → Giving a board its own columns</strong>. Add a status here and it becomes
              available to every board; whether a given board renders it is that board's filter, not a separate list of statuses.
            </P>

            <Sub title="Status categories">
              <P>Every custom status belongs to a category. The category is how Orbit maps your statuses to its internal logic (completion detection, stats, etc.):</P>
              <Table
                headers={['Category', 'Meaning', 'Fixed equivalent']}
                rows={[
                  ['Unstarted', 'Not yet begun', 'To Do'],
                  ['Started', 'Work in progress', 'In Progress'],
                  ['Completed', 'Work finished successfully', 'Done'],
                  ['Cancelled', 'Work abandoned', 'Done'],
                ]}
              />
            </Sub>

            <Sub title="Transition rules (Enforced mode only)">
              <P>A transition rule says "from status A, you may move to status B". Without a rule, that move is blocked.</P>
              <Ul items={[
                'Create rules in Project Settings → Transitions.',
                'A status with no outgoing rules is a terminal state (tasks can\'t leave it).',
                'A status with no incoming rules can only be used at task creation.',
              ]} />
            </Sub>

            <Sub title="Custom fields">
              <P>Admins can define extra fields on tasks in <strong className="text-gray-200">Project Settings → Statuses → Custom fields</strong>. Types: <Code>text</Code>, <Code>number</Code>, <Code>date</Code>, <Code>select</Code> (a choice list), and <Code>checkbox</Code>. They show on every task's detail panel.</P>
              <Table
                headers={['Mode', 'Custom fields']}
                rows={[
                  [<Badge color="bg-gray-700 text-gray-300">Flow</Badge>, 'None — Flow stays fixed and frictionless.'],
                  [<Badge color="bg-blue-900/60 text-blue-300">Guided</Badge>, 'Define and use fields; all optional.'],
                  [<Badge color="bg-purple-900/60 text-purple-300">Enforced</Badge>, 'Same, plus a field can be Required — saving is blocked while a required field is empty.'],
                ]}
              />
              <P>Values are stored on the task and validated by type (a number field rejects text, a select rejects values outside its options). Filtering boards by custom fields is on the roadmap.</P>
              <Example>
                <P>A support team adds a <Code>select</Code> field <strong className="text-gray-300">"Customer tier"</strong> with options Free / Pro / Enterprise, and a <Code>date</Code> field <strong className="text-gray-300">"SLA due"</strong>. In Enforced mode they mark "Customer tier" <strong className="text-gray-300">required</strong>, so no bug can be saved without it — every ticket is triageable from day one.</P>
              </Example>
            </Sub>

            <Sub title="Automation rules">
              <P>Available in <strong className="text-gray-200">Guided and Enforced</strong> (Flow runs no automation). Define rules in <strong className="text-gray-200">Project Settings → Statuses → Automation rules</strong>. Each rule is <strong className="text-gray-200">Trigger → Conditions → Actions</strong>:</P>
              <Ul items={[
                <><strong className="text-gray-200">Triggers:</strong> when a task is <Code>created</Code>, or when its <Code>status changes to</Code> a chosen status.</>,
                <><strong className="text-gray-200">Conditions (optional):</strong> add one or more "only if" filters on <Code>type</Code>, <Code>priority</Code>, <Code>status</Code>, or <Code>assignee</Code>. Each uses an operator — <Code>is</Code>, <Code>is not</Code>, <Code>is set</Code>, or <Code>is empty</Code>. Multiple conditions must <strong className="text-gray-200">all</strong> match (AND).</>,
                <><strong className="text-gray-200">Actions:</strong> assign to a member, set priority, add a tag, or post a comment — one or more per rule.</>,
                'Rules run automatically on the server when the trigger fires; toggle a rule off without deleting it.',
              ]} />
              <P>This is the general automation layer. The strict <strong className="text-gray-200">state-machine</strong> (which moves are allowed at all) is the separate Transition rules in Enforced mode.</P>
              <Example>
                <P><strong className="text-gray-300">Auto-triage incoming bugs:</strong></P>
                <Ul items={[
                  <><strong className="text-gray-300">Trigger:</strong> task is <Code>created</Code>.</>,
                  <><strong className="text-gray-300">Conditions:</strong> <Code>type is bug</Code> AND <Code>assignee is empty</Code>.</>,
                  <><strong className="text-gray-300">Actions:</strong> assign to the on-call engineer, set priority to High, add the <Code>triage</Code> tag.</>,
                ]} />
                <P>Now every unassigned bug lands on someone's plate, flagged, the moment it's filed — and a manually-assigned bug is left alone (the <Code>assignee is empty</Code> condition fails).</P>
              </Example>
            </Sub>
          </Section>

          {/* ── Sprints ─────────────────────────────────────────────────── */}
          <Section id="sprints" title="Sprints">
            <P>
              Sprints are time-boxed containers for work. <strong className="text-gray-200">How they behave depends on the project mode</strong>:
            </P>
            <Ul items={[
              <><strong className="text-gray-200">Flow</strong> — fully automated <strong className="text-gray-200">cycles</strong>. The system creates the current + upcoming cycles on a repeating schedule; <strong className="text-gray-200">started tasks auto-join the current cycle</strong> and unfinished work <strong className="text-gray-200">rolls forward automatically</strong> when a cycle ends. Configure duration, cooldown, anchor and upcoming count in Project Settings → Mode → Automated cycles; disabling closes the current cycle and removes upcoming ones. Cycles are project-scoped.</>,
              <><strong className="text-gray-200">Guided & Enforced</strong> — manual, board-scoped sprints (below). You start them by hand, and at the end you choose per sprint: a plain <strong className="text-gray-200">Close</strong> (nothing moves) or a formal <strong className="text-gray-200">Complete Sprint</strong> that sends incomplete tasks to the backlog, another sprint, or a brand-new sprint (completed tasks stay). A parent with unfinished children counts as incomplete.</>,
            ]} />
            <P>
              The rest of this section describes the <strong className="text-gray-200">manual sprint</strong> model used by Guided and Enforced.
            </P>

            <Sub title="Opening the sprint panel">
              <P>Click the <strong className="text-gray-200">flag icon</strong> (⚑) in the board toolbar to open the sprint panel. It slides in from the right as a drawer alongside the board. Click the icon again or the × in the panel header to close it.</P>
            </Sub>

            <Sub title="Sprint lifecycle">
              <Table
                headers={['State', 'What it means', 'Actions available']}
                rows={[
                  [<Badge color="bg-gray-700 text-gray-300">planned</Badge>, 'Sprint created, not yet started. Tasks can already be assigned to it.', 'Start Sprint, Delete'],
                  [<Badge color="bg-green-900/60 text-green-300">active</Badge>, 'Sprint is in progress. The active badge appears in the sprint list.', 'Close Sprint or Complete Sprint (Guided & Enforced) · Close Sprint (Flow)'],
                  [<Badge color="bg-gray-800 text-gray-500">closed</Badge>, 'Sprint is complete. Read-only — no further actions.', '—'],
                ]}
              />
              <P>
                In Guided and Enforced modes, both end-of-sprint styles are available and you pick per sprint:
                {' '}<strong className="text-gray-200">Close Sprint</strong> just sets it to closed — <strong className="text-gray-200">tasks are not moved</strong>; it's a reporting boundary (how YouTrack treats sprint ends).
                {' '}<strong className="text-gray-200">Complete Sprint</strong> requires you to send incomplete tasks to the backlog, another sprint, or a new one — completed tasks stay (how Jira treats sprint ends).
              </P>
            </Sub>

            <Sub title="Creating a sprint">
              <Ul items={[
                <>Click <Code>New Sprint</Code> in the sprint panel.</>,
                <>Enter a name (required), a start date, and an end date.</>,
                <>Click <Code>Create Sprint</Code>. The sprint appears in the list with a <Badge color="bg-gray-700 text-gray-300">planned</Badge> badge.</>,
              ]} />
            </Sub>

            <Sub title="Assigning tasks to a sprint">
              <P>Open a task's detail view. In the sidebar, find the <strong className="text-gray-200">Sprint</strong> field and select a sprint from the dropdown. All board sprints (planned and active) are listed. Closed sprints are not assignable.</P>
              <P>In <strong className="text-gray-200">Flow</strong> mode the same field is labelled <strong className="text-gray-200">Cycle</strong> and lists the project's automated cycles instead. You rarely need it: started tasks are auto-added to the current cycle, and unfinished work rolls forward on its own.</P>
            </Sub>

            <Sub title="How tasks join a sprint (no query auto-add)">
              <P>
                Orbit boards are <strong className="text-gray-200">containers</strong>, not saved queries. A task joins a sprint or cycle in exactly two ways:
              </P>
              <Ul items={[
                <><strong className="text-gray-200">Explicitly</strong> — you set the task's Sprint/Cycle field (Guided, Enforced, and manual picks in Flow).</>,
                <><strong className="text-gray-200">Automatically</strong> — in Flow only: started tasks auto-join the current cycle and unfinished work rolls forward.</>,
              ]} />
              <P>
                There is intentionally <strong className="text-gray-200">no "auto-add by saved query"</strong>. Because a board is a container rather than a query-defined view, a sprint never needs a query to populate — you assign, or let Flow automate. The filter bar and saved searches change <strong className="text-gray-200">what's shown</strong>, never which sprint a task belongs to. If you want automatic population, that's what Flow is for.
              </P>
            </Sub>

            <Sub title="Filtering by sprint">
              <P>Use the SmartFilterBar: type <Code>@sprint</Code> and select a sprint name. Only tasks assigned to that sprint are shown. Works in all four board views (Kanban, List, Calendar, Gantt).</P>
              <P>The <Code>@related</Code> field filters by your involvement — <strong className="text-gray-200">Commented by me</strong> and <strong className="text-gray-200">Mentions me</strong> — composable with every other filter, negatable, and saveable like any filter.</P>
            </Sub>

            <Sub title="Board scope while a sprint is active">
              <P>
                When a sprint is running, a <strong className="text-gray-200">Sprint / All</strong> toggle appears in the board toolbar and the board
                defaults to <strong className="text-gray-200">Sprint</strong> scope — showing only tasks assigned to the active sprint, like a Scrum board.
                Switch to <strong className="text-gray-200">All</strong> to see every task on the board; your choice is remembered per board on this device.
              </P>
              <Ul items={[
                <><strong className="text-gray-200">Where did last sprint's done tasks go?</strong> Tasks completed in a sprint stay assigned to that sprint when it closes. They are not moved to the next sprint or the backlog, so they don't appear in the new sprint's scope — find them in the closed sprint's <strong className="text-gray-200">Sprint Report</strong> (sprint panel) or via search.</>,
                <>With no active sprint the toggle is hidden and the board shows all tasks.</>,
                <>The toggle only affects the main board tab — the Backlog and Active Sprint tabs keep their own scope.</>,
              ]} />
            </Sub>

            <Sub title="Backlog tab">
              <P>
                The <strong className="text-gray-200">Backlog</strong> tab sits at the left of the tab bar, before the board tabs.
                It shows every task in the project that has <strong className="text-gray-200">no sprint assigned</strong>, across all boards.
                Use it as the staging area for unscheduled work.
              </P>
              <Ul items={[
                'Tasks appear in list view by default.',
                'Open a task\'s detail view and set the Sprint field to move it from the Backlog into a sprint.',
                'Creating a task from the Backlog view creates it in the project with no sprint — tasks belong to the project; boards are filtered views over them.',
                'SmartFilterBar still applies: narrow down by assignee, tag, type, etc.',
              ]} />
            </Sub>

            <Sub title="Active Sprint tab">
              <P>
                When a sprint is activated, an <strong className="text-gray-200">Active Sprint</strong> tab appears next to the Backlog tab.
                It shows all tasks assigned to the currently active sprint for the selected board, in list view.
                The tab disappears automatically when the sprint is closed.
              </P>
              <Ul items={[
                'Only one sprint can be active at a time per board.',
                'Tasks in the active sprint are drawn from across all boards — they remain on their original board but appear here as a unified list.',
                'Closing the sprint from the sprint panel removes the Active Sprint tab; tasks keep their status.',
              ]} />
            </Sub>

            <Sub title="Behavior by project mode">
              <Table
                headers={['', 'Flow', 'Guided', 'Enforced']}
                rows={[
                  ['Iteration type', 'Automated cycles', 'Manual sprints', 'Manual sprints'],
                  ['Scope', 'Project', 'Board', 'Board'],
                  ['Created by', 'Scheduler (auto)', 'You', 'You'],
                  ['Lifecycle', 'Time-driven', 'Start / Close or Complete', 'Start / Close or Complete'],
                  ['On end', 'Unfinished auto-rolls to next cycle', 'Your choice: Close (tasks stay) or Complete (move incomplete)', 'Your choice: Close (tasks stay) or Complete (move incomplete)'],
                  ['Completion gate', '—', '—', 'Parent with unfinished children counts as incomplete'],
                  ['Sprint filter in SmartFilterBar', '✓', '✓', '✓'],
                ]}
              />
              <P>In <strong className="text-gray-200">Enforced mode</strong>, completing a sprint does not relax transition rules. If you then change a task's status (e.g. moving it to Done), it must still pass through the configured allowed transitions.</P>
            </Sub>
          </Section>

          {/* ── Roadmap & Releases ──────────────────────────────────────── */}
          <Section id="roadmap-releases" title="Roadmap & Releases">
            <P>A <strong className="text-gray-200">Release</strong> is a shippable target — a version you're working toward (the equivalent of a "fix version" elsewhere). Tasks link to a release, and the <strong className="text-gray-200">Roadmap</strong> view plots releases on a timeline with live progress.</P>

            <Sub title="Creating & assigning releases">
              <Ul items={[
                <>Open the <strong className="text-gray-200">Roadmap</strong> view (the map icon in the view switcher). Admins get a "New release" form — name it (e.g. <Code>v1.2</Code>) and optionally set a <strong className="text-gray-200">target / ship date</strong>.</>,
                <>On any task, the detail panel has a <strong className="text-gray-200">Release</strong> dropdown — pick which release it ships in. A task belongs to at most one release.</>,
                <>Each release shows <strong className="text-gray-200">progress</strong> = done ÷ total linked tasks. "Done" follows the project's statuses (the Done/completed category in Guided/Enforced; the Done column in Flow).</>,
              ]} />
            </Sub>

            <Sub title="The Roadmap timeline">
              <P>Releases with a target date appear as bars on a month-scaled timeline, each filled to its completion %. <strong className="text-gray-200">Epics</strong> with a due date show on the same timeline in their own lane (purple), filled by how many of their child tasks are done — click an epic to open it. Items without a date are listed separately. Hover a bar for the exact count.</P>
            </Sub>

            <Sub title="Shipping a release">
              <P>Admins mark a release <strong className="text-gray-200">released</strong> with the rocket action.</P>
              <Ul items={[
                <>In <strong className="text-gray-200">Flow</strong> and <strong className="text-gray-200">Guided</strong>, it's a one-click status flip — allowed even with unfinished tasks (the result reports how many remained).</>,
                <>In <strong className="text-gray-200">Enforced</strong>, if any linked tasks aren't done you're prompted to decide first (like Complete Sprint): <strong className="text-gray-200">keep</strong> them on the release, send them to the <strong className="text-gray-200">backlog</strong>, or <strong className="text-gray-200">move</strong> them to another release.</>,
              ]} />
              <Example>
                <P>A team planning <Code>v1.0</Code> for Aug 1 creates the release, assigns 8 tasks to it, and watches the Roadmap bar fill as work completes. At 6/8 done (75%) on launch day they ship anyway — the two stragglers are reassigned to <Code>v1.1</Code>.</P>
              </Example>
              <P>Release states: <Badge color="bg-blue-900/60 text-blue-300">planned</Badge> <Badge color="bg-green-900/60 text-green-300">released</Badge> <Badge color="bg-gray-700 text-gray-400">archived</Badge>. Releases vs sprints: a <strong className="text-gray-200">sprint</strong> is a time-box (when you work); a <strong className="text-gray-200">release</strong> is a shippable bundle (what goes out) — a task can be in both.</P>
            </Sub>
          </Section>

          {/* ── Estimation ──────────────────────────────────────────────── */}
          <Section id="estimation" title="Estimation & Measurement">
            <P>
              How a project sizes and forecasts work is a project setting — <strong className="text-gray-200">Project Settings → Mode → Estimation &amp; measurement</strong>. Four methods are available: <strong className="text-gray-200">Story Points</strong> (classic), <strong className="text-gray-200">Flow</strong> (forecast from throughput), <strong className="text-gray-200">Baseline</strong> (local effort prediction), and <strong className="text-gray-200">Impact</strong> (value ÷ effort prioritisation). Pick the one that fits how your team works; switching is non-destructive.
            </P>
            <Sub title="Default by mode">
              <P>The method follows the same vendor lineage as the modes themselves:</P>
              <Ul items={[
                <><strong className="text-gray-200">Flow mode</strong> — estimation starts <strong className="text-gray-200">off</strong> (no sizing). Flow forecasting is the natural fit: forecast from throughput, no points. (Linear-style: cycles, no mandatory estimates.)</>,
                <><strong className="text-gray-200">Guided &amp; Enforced</strong> — default to <strong className="text-gray-200">Story Points</strong> the first time you enter the mode, matching Jira Scrum boards and YouTrack agile boards, where points are the out-of-the-box estimation field. Already picked a method? Your choice is kept — the default only fills the untouched setting.</>,
                'Any mode can use any method — the defaults are a sensible starting point, not a restriction. Change it anytime under Estimation & measurement.',
              ]} />
            </Sub>

            <Sub title="Story Points">
              <P>The classic relative-sizing model. When enabled, a <strong className="text-gray-200">Story Points</strong> field appears in the task detail sidebar — pick a value from the Fibonacci scale (1, 2, 3, 5, 8, 13, 21) for quick sizing, <strong className="text-gray-200">type any custom number</strong> in the box beside the presets (the field is a free non-negative integer, like Jira's Story Points field), or clear it. Points show as a small badge on the task card.</P>
              <Ul items={[
                'Points are unitless and optional — an unestimated task simply has none.',
                'Epics show a children-rollup total (sum of their child tasks\' points).',
                'Reporting is team-level. Per-developer point breakdowns are off by default.',
              ]} />
              <P><strong className="text-gray-200">Points are relative, not hours.</strong> Anchor on one task everyone agrees on, then size others against it — roughly each Fibonacci step is "about twice as much" as the one before. The gaps widen on purpose: the bigger the work, the less precisely you can size it.</P>
              <Example>
                <P>Pick an anchor: <strong className="text-gray-300">"Add a logout button"</strong> = <Code>2</Code> (small, well understood).</P>
                <Ul items={[
                  <>"Add a password-strength meter" — a bit more, no real unknowns → <Code>3</Code>.</>,
                  <>"Build the forgot-password flow (email + reset)" — several parts → <Code>8</Code>.</>,
                  <>"Migrate auth to OAuth with a vendor we've never used" — big and uncertain → <Code>13</Code>, or split it into smaller stories first.</>,
                ]} />
                <P>A task that's a <em>real</em> outlier (say a one-off "47") can be typed in the custom box — but if you're reaching for big custom numbers often, that's a signal to break the work down.</P>
              </Example>
            </Sub>

            <Sub title="Planning poker (estimate together)">
              <P>From a task's Story Points field, click <strong className="text-gray-200">Estimate together</strong> to start a live session. Everyone in the project votes a card (hidden); the panel shows how many have voted. Click <strong className="text-gray-200">Reveal</strong> to show all votes at once, then pick the agreed value to set the estimate. <strong className="text-gray-200">Re-vote</strong> clears and runs again. Sessions are real-time and ephemeral — only the final estimate is saved.</P>
              <Example>
                <P>Estimating "Build the forgot-password flow" as a team:</P>
                <Ul items={[
                  'Click Estimate together. Three people vote in secret: 5, 8, 8.',
                  'Reveal. The 5-voter explains they\'d reuse an existing email helper; the 8-voters were counting the reset-token expiry + tests.',
                  'After the chat, you Re-vote → everyone lands on 8. Pick 8 to save it as the estimate.',
                ]} />
                <P>The disagreement <em>is</em> the value — it surfaced a hidden assumption before any code was written.</P>
              </Example>
            </Sub>

            <Sub title="Velocity, capacity & commitment">
              <P>When you <strong className="text-gray-200">start (activate)</strong> a sprint, its <strong className="text-gray-200">commitment</strong> is captured — the sum of the story points assigned at that moment. The <strong className="text-gray-200">Velocity</strong> chart (Reports tab) then shows, per closed sprint:</P>
              <Ul items={[
                'Committed vs completed points, side by side.',
                'A rolling average of completed points over the last 3 sprints.',
                'A suggested capacity for the next sprint, derived from that average.',
              ]} />
            </Sub>

            <Sub title="Sprint report & points burndown">
              <P>Each closed sprint shows a compact report in the sprint panel: <strong className="text-gray-200">committed vs completed</strong> points, <strong className="text-gray-200">scope change</strong> (points added or removed after the sprint started) and <strong className="text-gray-200">carryover</strong> (incomplete points). "Completed" means a task reached a Done/Completed status.</P>
              <P>The Reports tab also shows a <strong className="text-gray-200">Points Burndown</strong> — remaining story points over time — alongside the count-based burndown. An active sprint's panel warns when committed points run over the suggested capacity.</P>
            </Sub>

            <Sub title="Flow forecasting (no estimates)">
              <P>The evidence-backed alternative to points: instead of estimating, it <strong className="text-gray-200">forecasts delivery from your actual throughput</strong>. The Reports tab shows weekly completed-item throughput and a <strong className="text-gray-200">Monte Carlo forecast</strong> — "50% / 85% / 95% of remaining work done by &lt;date&gt;" — as ranges, never a single false-precise date.</P>
              <Ul items={[
                'Uses a rolling window of recent throughput, so new hires / departures are absorbed automatically — nothing per-developer.',
                'Needs a little history (~2 weeks of completed work); until then it shows a "not enough history yet" state.',
                'No story points, no planning poker — purely measured flow.',
              ]} />
            </Sub>

            <Sub title="Baseline (predicted effort)">
              <P>Predicts how long a task is likely to take by finding the <strong className="text-gray-200">most similar finished tasks</strong> (by their text) and using their actual lead-time. The task detail shows "Predicted effort ~N days" plus the similar tasks it learned from.</P>
              <Ul items={[
                'Runs entirely locally — no external AI service, no API key, nothing leaves your server.',
                'Trained on your own project\'s closed tasks; needs a few finished tasks before it predicts.',
                'Catches surprises: an in-progress task running well past its prediction gets an ⚠ "Overrunning" flag — a chance to spot hidden scope early.',
                'A hint, never a target — task-level only, nothing per-developer.',
              ]} />
            </Sub>

            <Sub title="Impact (value ÷ effort)">
              <P>Prioritise by worth, not just size. Give each task a <strong className="text-gray-200">business value</strong> (1–5) and a <strong className="text-gray-200">size</strong>, and the task shows a <strong className="text-gray-200">priority score = value ÷ size</strong> (WSJF-lite) — higher means do it sooner. It directs <em>what to build</em>, never who built it.</P>
              <P>Today the value is a <strong className="text-gray-200">human judgement</strong>. A future version can feed it from real <strong className="text-gray-200">outcome data</strong> — your own product's usage, revenue or support load — so a task's value reflects what it actually moved.</P>
              <P>Two honest caveats on that future version: the outcome data lives in <strong className="text-gray-200">your</strong> systems (analytics, billing, helpdesk), so it needs an integration to bring it in; and a task has to be <strong className="text-gray-200">linked to something measurable</strong> (a release or feature) for the number to mean anything. Orbit will never auto-guess "this ticket earned €X" — that attribution is yours to make. Until then, the 1–5 value is the honest, useful proxy.</P>
            </Sub>

            <Sub title="Switching methods">
              <P>The method is a setting you can change anytime — estimates and history persist, so switching is non-destructive. Story Points is the familiar day-one option; <strong className="text-gray-200">Flow</strong> and <strong className="text-gray-200">Baseline</strong> take over once you have throughput / finished-task history; <strong className="text-gray-200">Impact</strong> is for teams that prioritise by value.</P>
            </Sub>
          </Section>

          {/* ── Tags & Filters ──────────────────────────────────────────── */}
          <Section id="tags-filters" title="Tags, Filters & Saved Searches">

            <Sub title="Tags">
              <P>Tags are project-scoped labels with a custom color. Apply multiple tags to any task. Create tags inline from the task detail or the tag picker.</P>
              <Ul items={[
                'Click a tag pill on a task card to filter the board by that tag instantly.',
                'Tags are shared across all boards in a project.',
                'Tag colors auto-adjust their text for WCAG contrast.',
              ]} />
            </Sub>

            <Sub title="SmartFilterBar">
              <P>The filter bar above the board uses a structured query syntax. Type <Code>@</Code> or use the dropdown to build filters. Filters apply to all project tasks across all boards.</P>
              <Table
                headers={['Syntax', 'Example', 'Effect']}
                rows={[
                  [<Code>@field:value</Code>, <Code>@assignee:alice</Code>, 'Show tasks matching that value'],
                  [<Code>-@field:value</Code>, <Code>-@tag:blocked</Code>, 'Exclude tasks matching that value'],
                  ['Multiple values (same field)', <Code>@type:bug @type:task</Code>, 'OR — show either type'],
                  ['Cross-field', <Code>@type:bug @assignee:bob</Code>, 'AND — must match both'],
                  [<Code>@text:query</Code>, <Code>@text:login</Code>, 'Match title or description content'],
                ]}
              />
              <Example>
                <P>"Show me open bugs assigned to Bob or Alice that aren't blocked":</P>
                <P><Code>@type:bug @assignee:bob @assignee:alice -@tag:blocked</Code></P>
                <P>Reads as: type <em>is</em> bug, <strong className="text-gray-300">AND</strong> assignee is bob <strong className="text-gray-300">OR</strong> alice (same field = OR), <strong className="text-gray-300">AND NOT</strong> tagged blocked. Save it from the bookmark icon to reuse it as a one-click view.</P>
              </Example>
            </Sub>

            <Sub title="Filter fields reference">
              <Table
                headers={['Field', 'Values', 'Flow', 'Guided', 'Enforced']}
                rows={[
                  ['assignee', 'Project member name', '✓', '✓', '✓'],
                  ['tag', 'Tag name', '✓', '✓', '✓'],
                  ['status', 'To Do / In Progress / Done (Flow); custom status name (Guided/Enforced)', '✓', '✓', '✓'],
                  ['priority', 'Priority name from project priority scheme', '✓', '✓', '✓'],
                  ['type', 'epic / story / task / bug', '✓', '✓', '✓'],
                  ['epic', 'Epic task title — shows the epic itself and all its children', '✓', '✓', '✓'],
                  ['sprint', 'Sprint name — shows tasks assigned to that sprint', '✓', '✓', '✓'],
                  ['severity', 'critical / high / medium / low', '✓', '✓', '✓'],
                  ['due', 'overdue / today / this_week / next_week / none', '✓', '✓', '✓'],
                  ['text', 'Any string — searches title and description', '✓', '✓', '✓'],
                ]}
              />
              <P><strong className="text-gray-200">Status field note:</strong> In Flow mode, values are the three fixed statuses. In Guided and Enforced modes, values are your custom status names. The filter bar options update automatically based on the active project mode.</P>
              <P><strong className="text-gray-200">Priority field note:</strong> Values come from the project's priority scheme. If no scheme is assigned, the priority filter has no options.</P>
            </Sub>

            <Sub title="Saved searches">
              <P>Save any active filter combination as a named search. Click the <strong className="text-gray-200">bookmark icon</strong> in the toolbar (right of the filter bar) to open the saved searches panel.</P>
              <Ul items={[
                'With filters active: type a name and click Save to store the current filters.',
                'Saved searches are listed at the top of the panel — click any to instantly apply it.',
                'Click × next to a saved search to delete it.',
                'Saved searches are personal (per user per project) — not shared with other members.',
                'Combine with per-board saved state: open a board, apply a saved search, and the filters are remembered for that board automatically.',
              ]} />
              <P>Typical use: create a board called "Epic A bugs", apply <Code>@epic:Epic A @type:bug</Code>, save as "Epic A bugs". Every time you open that board the filters restore automatically.</P>
            </Sub>

            <Sub title="Bulk edit (command dialog)">
              <P>Select multiple tasks, then apply one command to all of them — the same <Code>@field:value</Code> language as the filter bar, YouTrack-style.</P>
              <Ul items={[
                <><strong className="text-gray-200">Selecting:</strong> in List view, <Code>shift-click</Code> selects a range and <Code>ctrl/cmd-click</Code> toggles a row; on the kanban board use the checkbox that appears on each card. Plain click still opens the task. <Code>Esc</Code> clears the selection.</>,
                <><strong className="text-gray-200">Commanding:</strong> a bar appears at the bottom with quick status buttons, Delete, and <strong className="text-gray-200">Command…</strong> — the dialog accepts e.g. <Code>@status:done @assignee:me @tag:+regression @tag:-triage</Code>, with quotes for names containing spaces (<Code>@sprint:"Sprint 5"</Code>).</>,
                'Fields: @status, @assignee (me / none / username), @priority, @sprint, @tag:+name / @tag:-name. A live preview shows exactly what will change before you apply.',
                'Every task goes through the normal update pipeline — transition rules still apply per task in Enforced mode, and notifications, activity, and webhooks fire as usual. Blocked tasks are reported ("3 blocked") and stay selected so you can retry.',
                'Up to 100 tasks per command.',
              ]} />
            </Sub>
          </Section>

          {/* ── Issues Page & Export (REQ-159) ──────────────────────────── */}
          <Section id="issues-export" title="Issues Page & Export">
            <P>The <strong className="text-gray-200">Issues page</strong> (command palette → "Go to Issues") shows every task in the project with exactly <strong className="text-gray-200">one</strong> filter — the filter bar. Board settings don't apply here: no admin board filter, no done-column cleanup, no sprint scope. What you query is what you get — which is why exports live on this page and not on boards.</P>
            <Ul items={[
              <><strong className="text-gray-200">Issue keys</strong> — every row leads its title with the issue key (<Code>HW-22</Code>), so you can scan by number rather than by reading titles. A key belonging to a Done issue is struck through. The same treatment appears in the board's List view.</>,
              <><strong className="text-gray-200">Sort by issue number</strong> — click the <strong className="text-gray-200">Key / Title</strong> header to order the list by issue key, i.e. creation order. First click oldest-first, click again for newest-first, a third click clears back to the default order. This is the "show me the oldest open issues" view. (The key leads the cell, so this header sorts by number, not alphabetically — same as Status and Due Date each sort their own column.)</>,
              <><strong className="text-gray-200">Export view</strong> — instant CSV of the rows and columns you're currently looking at. Combine with a saved search for a reusable "export template".</>,
              <><strong className="text-gray-200">Export & Import page</strong> — the Download icon in the board header (or "Export all…" on Issues): full server-side dump of every task including ones hidden from boards, with a column picker. All columns on by default; your choice is remembered. Custom fields export as one column each.</>,
              'The same page hosts import (admin): plain CSV (≤500 rows, per-row error report), Trello board JSON, and Jira CSV exports. Tracker imports map lists/statuses by name where possible, labels → tags, Trello checklists → subtasks, and comments arrive attributed to the importer with the original author named. Assignees are never auto-created.',
              'The default export round-trips with CSV import — you can export a project and import the file into another Orbit project (title, description, status, type, due date survive).',
              'Moving data to another tracker? Export everything — Jira, YouTrack, and Linear importers map columns interactively, so field presence matters more than header names.',
              'Comments, attachments, and task links are deliberately not in the CSV; they have no portable CSV shape.',
            ]} />
          </Section>

          {/* ── Collaboration ───────────────────────────────────────────── */}
          <Section id="collaboration" title="Collaboration">

            <Sub title="Real-time description editing">
              <P>Task descriptions are collaboratively edited using <strong className="text-gray-200">Tiptap + Yjs</strong>. Multiple people can edit the same description simultaneously. Cursors and presence indicators show who's active. Changes sync automatically — no Save button needed.</P>
            </Sub>

            <Sub title="Comments">
              <P>Comment thread lives in the task detail view under the Comments tab. Comments support rich text (bold, italic, lists, code blocks, links). Comments can be edited (with full edit history visible) and deleted by the author or an admin.</P>
            </Sub>

            <Sub title="Reactions & custom emotes">
              <P>React to any comment via the smiley button — a curated set of eight defaults (👍 👎 ❤️ 🎉 👀 🚀 😄 🤔) keeps threads readable. Reactions are per-user and idempotent: click the same emoji again to remove yours.</P>
              <P><strong className="text-gray-200">Custom emotes</strong> make the picker yours. In <strong className="text-gray-200">Preferences → Emotes</strong>, any member can upload project-scoped emotes (PNG / GIF / WebP / JPEG, ≤256 KB) referenced as <code className="text-[#a99dff]">:name:</code>. Upload one named after a default — e.g. <code className="text-[#a99dff]">thumbsup</code> — and it <strong className="text-gray-200">replaces</strong> that default in the picker for the whole project; delete it to restore the original.</P>
              <P>Deleting an emote also removes every reaction that used it — no orphaned <code className="text-[#a99dff]">:name:</code> husks in old comments. Emotes are per-project, so each team curates its own culture.</P>
            </Sub>

            <Sub title="Watching">
              <P>Watch a task to receive notifications when it changes. The eye icon in the task header toggles watching. You are auto-watched when you create or are assigned a task.</P>
            </Sub>

            <Sub title="Notifications">
              <P>The bell icon in the header shows unread notifications. Notifications are sent for: status changes, assignee changes, new comments, priority changes, and due date changes — depending on your preferences.</P>
              <P>Configure which events trigger notifications in <strong className="text-gray-200">Preferences → Notifications</strong>.</P>
            </Sub>

            <Sub title="Activity feed">
              <P>Every task has an Activity tab showing a full changelog — who changed what, when. The project-level Audit Log (header → scroll icon) shows all activity across the entire project, filterable and exportable as CSV or JSON.</P>
            </Sub>

            <Sub title="Public share links (REQ-163)">
              <P>Need to show one task to someone outside the project — a contractor, a customer, a stakeholder — without creating an account for them? Admins can mint a <strong className="text-gray-200">public share link</strong> from the task's <strong className="text-gray-200">⋯ menu → Share</strong>. Anyone with the URL gets a clean read-only page: title, description, status, and subtasks. No login, no app chrome.</P>
              <Ul items={[
                'Links use an unguessable 256-bit token — sharing one task exposes nothing else.',
                'The public page shows a strict allowlist only: no assignee emails, no worklogs, no attachments, no internal IDs.',
                'Revoke any time from the same menu — a revoked link turns into a 404, indistinguishable from a link that never existed.',
                'This is the only part of Orbit reachable without signing in, and it is rate-limited.',
              ]} />
              <P>Orbit's links work per task — share exactly one issue with an outsider, the way you'd share a single document, without opening the project.</P>
            </Sub>
          </Section>

          {/* ── Git Integration ─────────────────────────────────────────── */}
          <Section id="git-integration" title="Git Integration">
            <P>Connect a GitHub, GitLab, or Bitbucket repository so branches, commits, and pull requests drive your tasks — and tasks show the code linked to them. Configure under <strong className="text-gray-200">Project Settings → Integrations</strong> (admins only).</P>

            <Sub title="Task references">
              <P>Tasks are referenced by their key, e.g. <code className="text-[#a99dff]">ORB-123</code> (project key + number). Put that reference in a <strong className="text-gray-200">branch name, pull-request title/description, or commit message</strong> and Orbit links it automatically. Each task's Development panel has a <strong className="text-gray-200">"Copy branch name"</strong> button that gives you a ready-made name like <code className="text-[#a99dff]">anon/orb-123-fix-the-bug</code>.</P>
              <P>You can connect <strong className="text-gray-200">multiple repositories</strong> to one project. The Development panel <strong className="text-gray-200">groups linked items by repository, then by kind</strong> — Pull Requests, then Branches, then Commits — so a task whose work spans several repos stays readable instead of showing one flat event stream. A <strong className="text-gray-200">state badge</strong> (open / merged / closed) sits on <strong className="text-gray-200">pull requests</strong>, where it carries meaning; branches and commits, which have no such lifecycle, show none.</P>
            </Sub>

            <Sub title="What automation does — by mode">
              <P>VCS behaviour mirrors the tool each mode is modelled on, so a team migrating in finds the git workflow they already know.</P>
              <P><strong className="text-gray-200">Flow (Linear-style) — automatic.</strong> Zero config: branch → In Progress, PR opened → In Progress, PR merged → Done.</P>
              <P><strong className="text-gray-200">Guided (YouTrack-style) — command-driven.</strong> Same defaults, plus commit commands you control: <code className="text-[#a99dff]">#comment &lt;text&gt;</code>, <code className="text-[#a99dff]">#close</code>/<code className="text-[#a99dff]">#done</code>, and <code className="text-[#a99dff]">#{'{'}Status name{'}'}</code> to move the task to any named status. Developers drive completion, so multi-repo tasks don't close by surprise.</P>
              <P><strong className="text-gray-200">Enforced (Jira-style) — rules + conditions.</strong> VCS events run through <strong className="text-gray-200">automation rules</strong> that respect your transition rules (an illegal move is skipped and noted, never forced). A rule such as <em>"PR merged · no other open PRs → Done"</em> closes a task only once <strong className="text-gray-200">every</strong> connected repo's PR has merged.</P>
            </Sub>

            <Sub title="Connecting a repository">
              <P><strong className="text-gray-200">GitHub & GitLab</strong> use a lightweight <strong className="text-gray-200">device-flow sign-in</strong> (like VS Code): click Authorize, enter the short code in your browser, done — no app registration or token to paste. <strong className="text-gray-200">Bitbucket</strong> (which has no device flow) takes a workspace/repository access token instead. In all cases the connect screen shows a <strong className="text-gray-200">webhook URL + secret</strong> to add in the provider's repository settings — that webhook is what delivers the events.</P>
              <p className="text-gray-400 text-sm leading-relaxed mb-3">Self-hosting note: device-flow sign-in requires the operator to set <code className="text-[#a99dff]">GITHUB_OAUTH_CLIENT_ID</code> / <code className="text-[#a99dff]">GITLAB_OAUTH_CLIENT_ID</code> and an <code className="text-[#a99dff]">ENCRYPTION_KEY</code>. If unset, that provider's sign-in is hidden and you can still finish by adding the webhook manually — no credentials are stored in that case.</p>
            </Sub>
          </Section>

          {/* ── API & Webhooks ──────────────────────────────────────────── */}
          <Section id="api-webhooks" title="API & Webhooks">
            <P>
              Orbit is scriptable: everything the UI does goes through the same REST API, and projects can push
              events to your systems via signed webhooks.
            </P>

            <Sub title="Personal API tokens">
              <P>
                Create tokens in <strong className="text-gray-200">Preferences → API Tokens</strong>. The token value
                (<Code>orbit_pat_…</Code>) is shown <strong className="text-gray-200">once</strong> — store it in your
                secret manager. Two scopes: <strong className="text-gray-200">read-only</strong> (GET only) and{' '}
                <strong className="text-gray-200">read &amp; write</strong>. Revoking a token kills it immediately.
              </P>
              <P>Use it as a Bearer token anywhere a session works:</P>
              <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mb-3">
{`curl -H "Authorization: Bearer orbit_pat_..." \\
  https://your-orbit/api/v1/users/me/tasks?facet=assigned`}
              </pre>
            </Sub>

            <Sub title="Outbound webhooks">
              <P>
                Project admins configure webhooks in <strong className="text-gray-200">Project Settings → Integrations</strong>:
                a URL plus the events to subscribe to (task created/updated/completed/deleted, comment added, sprint closed).
                Orbit POSTs JSON with up to 3 delivery attempts; the last HTTP status is shown per webhook.
              </P>
              <P>
                Every request carries <Code>X-Orbit-Event</Code> and an <Code>X-Orbit-Signature</Code> header —
                an HMAC-SHA256 of the raw body using your signing secret (shown once at creation). Verify before trusting:
              </P>
              <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto mb-3">
{`# python
import hmac, hashlib
expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
valid = hmac.compare_digest(expected, request.headers["X-Orbit-Signature"])`}
              </pre>
            </Sub>

            <Sub title="Time tracking">
              <P>
                Every task has a <strong className="text-gray-200">Time spent</strong> section in its detail view.
                Log durations as <Code>2h</Code>, <Code>30m</Code>, <Code>1h 30m</Code> or <Code>1.5h</Code>, with an
                optional note — the task shows its running total and every entry. You can delete your own entries.
                Time tracking is independent of the project's estimation method: story points size the work,
                hours record what it actually cost.
              </P>
              <P>
                Per-user totals for a project and date range: <Code>GET /projects/{'{id}'}/stats/time-report?from=&amp;to=</Code> —
                combine with an API token for timesheets and invoicing scripts.
              </P>
            </Sub>

            <Sub title="Slack & Discord">
              <P>
                No middleware needed — pick the <strong className="text-gray-200">Slack</strong> or{' '}
                <strong className="text-gray-200">Discord</strong> delivery format and Orbit posts human-readable
                messages (e.g. <Code>✅ ORB-7 "Fix login bug" completed</Code>) instead of the signed JSON envelope.
              </P>
              <Ul items={[
                <><strong className="text-gray-200">Slack</strong>: create an Incoming Webhook in your Slack app settings, paste its URL into Orbit, pick the format "Slack" and the events you want in the channel.</>,
                <><strong className="text-gray-200">Discord</strong>: Server Settings → Integrations → Webhooks → New Webhook, copy the URL, paste into Orbit with format "Discord".</>,
                <>Chat deliveries are unsigned — the webhook URL itself is the credential, per both providers' convention. Treat it like a password.</>,
              ]} />
            </Sub>
          </Section>

          {/* ── Members & Roles ─────────────────────────────────────────── */}
          <Section id="members-roles" title="Members & Roles">
            <P>Invite people to a project under <strong className="text-gray-200">Project Settings → Members</strong> (also reachable via the Users icon in the header, or <Code>M</Code>). Invites are sent by email. The member list is visible to every role; inviting, changing roles, and removing members require project admin.</P>
            <P>Opening an invite link takes a new person to <strong className="text-gray-200">Register</strong>, and someone who already has an Orbit account to <strong className="text-gray-200">Sign in</strong> (password or Google) — either way the invite is applied automatically after they're in.</P>
            <Table
              headers={['Role', 'What they can do']}
              rows={[
                ['Owner', 'Everything. Cannot be removed. Implicitly admin on all operations.'],
                ['Admin', 'All task/board operations + invite/remove members, rename/delete project, change settings.'],
                ['Member', 'Create, edit, and delete tasks. Comment. Cannot change project settings or manage members.'],
                ['Viewer', 'Read-only. Can see tasks, comments, and activity. Cannot make changes.'],
              ]}
            />
            <P>Role changes take effect immediately. Removing a member revokes access instantly.</P>
            <Sub title="What happens when you remove someone">
              <Ul items={[
                'Their access is revoked immediately — they can no longer open the project.',
                'Any tasks assigned to them are unassigned. Leaving them assigned would point the work at someone who can no longer open the project: the team would see a blank assignee while filters and reports still counted it as assigned, and it would vanish from that person\'s My Work.',
                'If they were the project\'s default assignee, that setting resets to Unassigned.',
                'Nothing else is deleted — tasks they created, their comments, and the activity history all remain.',
              ]} />
            </Sub>
            <Sub title="Default assignee for new tasks">
              <P>Admins can decide who new tasks are assigned to by default, under <strong className="text-gray-200">Project Settings → Defaults</strong>. Three choices:</P>
              <Table
                headers={['Option', 'Effect']}
                rows={[
                  ['Unassigned', 'New tasks start with no assignee. This is the default for every project.'],
                  ['Creator', 'Each new task is assigned to whoever created it.'],
                  ['Specific member', 'Every new task goes to one chosen person. They must be a member of the project.'],
                ]}
              />
              <P>When you open <strong className="text-gray-200">Create Task</strong>, the Assignee field is already filled in with whoever the default points at, so you can see where the task is about to land and change it before saving. Clearing it back to <strong className="text-gray-200">Unassigned</strong> sticks — the default will not quietly put it back.</P>
              <Ul items={[
                'Setting an assignee while creating a task always wins over the default.',
                'The default applies only when a task is created. Clearing the assignee on an existing task just leaves it unassigned.',
                'Imports never apply the default. A CSV, Trello, or Jira row keeps whatever assignee the import data resolves to — and stays unassigned if there is none, rather than silently assigning hundreds of rows to one person.',
                'Recurring tasks do follow the default, since a scheduled task is created rather than imported.',
                'The setting is project-wide and admin-only: everyone working in the project gets the same behaviour.',
              ]} />
            </Sub>
            <Sub title="Two kinds of admin">
              <P>The <strong className="text-gray-200">project admin</strong> role above is scoped to one project. Separately, a self-hosted Orbit instance has an optional <strong className="text-gray-200">instance admin</strong> (superuser) — the operator account named by the <Code>ORBIT_SUPERUSER_EMAIL</Code> environment variable at startup.</P>
              <Ul items={[
                'Instance admins manage accounts on the whole instance: list and search users, deactivate/reactivate accounts, and send password-reset codes — from the Instance Admin page in the user menu (visible only to superusers).',
                'Being an instance admin grants no project access. The operator cannot read tasks in projects they are not a member of.',
                'Deactivating an account blocks every sign-in path immediately — password, Google, API tokens, and existing sessions.',
                'If ORBIT_SUPERUSER_EMAIL is not set, the instance simply has no admin surface.',
              ]} />
            </Sub>
          </Section>

          {/* ── Search ──────────────────────────────────────────────────── */}
          <Section id="search" title="Search">
            <P>The search bar in the header is <strong className="text-gray-200">global</strong> — it searches tasks across <strong className="text-gray-200">every project you can access</strong> (owned or joined), not just the one you're looking at. Powered by PostgreSQL full-text search — typo-tolerant matching and English stemming (searching "running" finds "run").</P>
            <Ul items={[
              'Minimum 2 characters before results appear.',
              'Results are ranked by relevance and show each task\'s project key, so matches in different projects are easy to tell apart.',
              'Searches title and description content; a ticket id (e.g. PR-42) or a bare number jumps straight to that task.',
              'Click a result to open it — if it\'s in another project, Orbit switches to that project and opens the task.',
              'Other people\'s projects never appear; you only ever see what you\'re a member of.',
            ]} />
            <P>Need to filter <em>within</em> a board (by assignee, tag, status…)? That's the <strong className="text-gray-200">SmartFilterBar</strong> above the board — separate from this global lookup.</P>
          </Section>

          {/* ── Keyboard Shortcuts ──────────────────────────────────────── */}
          <Section id="keyboard-shortcuts" title="Keyboard Shortcuts">
            <Table
              headers={['Shortcut', 'Action']}
              rows={[
                [<Code>Ctrl/Cmd + K</Code>, 'Open the command palette'],
                [<Code>C</Code>, 'Create new task'],
                [<Code>?</Code>, 'Open keyboard shortcuts help overlay'],
                [<Code>/</Code>, 'Search / filter'],
                [<Code>N</Code>, 'Toggle notifications panel'],
                [<Code>M</Code>, 'Go to Members (Project Settings → Members)'],
                [<Code>I</Code>, 'Go to Issues'],
                [<Code>E</Code>, 'Go to Export & Import'],
                [<Code>S</Code>, 'Go to Project Settings'],
                [<Code>A</Code>, 'Go to Audit Log'],
                [<Code>P</Code>, 'Go to Preferences'],
                [<Code>W</Code>, 'Go to My Work'],
                [<Code>D</Code>, 'Go to Dashboard'],
                [<Code>H</Code>, 'Go to Help'],
                [<Code>T</Code>, 'Cycle theme (Light / Dark / System)'],
                [<Code>B</Code>, 'New board'],
                [<Code>→</Code>, 'Next board tab'],
                [<Code>←</Code>, 'Previous board tab'],
                [<Code>Esc</Code>, 'Close any open modal or panel'],
              ]}
            />
            <P>Every shortcut is rebindable in <strong className="text-gray-200">Preferences → Key Bindings</strong>. Single-key shortcuts are ignored while typing in a text field.</P>
            <Sub title="Command palette">
              <P>Press <Code>Ctrl + K</Code> (or <Code>Cmd + K</Code> on mac) anywhere to open a searchable palette. Type to fuzzy-filter, use <Code>↑</Code>/<Code>↓</Code> to move, <Code>↵</Code> to run, and <Code>Esc</Code> to close. It covers:</P>
              <Ul items={[
                'Create a task',
                'Jump to Members, Issues, Export & Import, Project Settings, Audit Log, Preferences, My Work, Dashboard, or Help',
                'Toggle notifications, open the shortcuts overlay, switch theme (Light / Dark / System)',
                'Switch the active board or project',
                <>Search tasks in the current project — type 2+ characters and pick a result to open it.</>,
              ]} />
            </Sub>
            <P>The full shortcut reference is also available in-app via the <Code>?</Code> key.</P>
          </Section>

          {/* ── Reports ─────────────────────────────────────────────────── */}
          <Section id="reports" title="Reports">
            <P>Found under the Audit Log page → Reports tab. All charts support date range filtering.</P>

            <Sub title="Burndown chart">
              <P>Shows remaining work (open tasks) vs time within a sprint or date range. The ideal line assumes linear progress. Deviation above it means you're falling behind.</P>
            </Sub>

            <Sub title="Cumulative Flow Diagram (CFD)">
              <P>Stacked area chart showing how many tasks are in each status over time. Widening bands indicate bottlenecks. Flat top line means no new work is being added.</P>
            </Sub>

            <Sub title="Time in status">
              <P>Average and median time tasks spend in each status. Long dwell times in a specific status usually indicate a bottleneck or unclear ownership.</P>
            </Sub>

            <Sub title="Cycle time">
              <P>Measures how long tasks take from "started" to "done" (cycle time) or from creation to done (lead time). P50/P85/P95 percentiles give you a distribution — P95 is your worst-case SLA.</P>
            </Sub>

            <Sub title="Task stats overview">
              <P>Pie and bar charts showing task distribution by status, priority, and type. Use the date range pills to compare periods.</P>
            </Sub>
          </Section>

        </main>
      </div>
    </div>
  )
}
