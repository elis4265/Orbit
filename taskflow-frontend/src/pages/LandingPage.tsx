// Marketing landing page for signed-out visitors on '/'. Frameless (no
// AppShell), dark, mobile-first. Authenticated users never see this — App.tsx
// routes them straight to the board.
import { Link } from 'react-router-dom'
import {
  SquareKanban,
  Users,
  GitBranch,
  BarChart3,
  Search,
  Server,
  type LucideIcon,
} from 'lucide-react'
import openImg from '../assets/open.png'
import guidedImg from '../assets/guided.png'
import enforcedImg from '../assets/enforced.png'

const MODES: { image: string; label: string; subtitle: string; body: string }[] = [
  {
    image: openImg,
    label: 'Flow',
    subtitle: 'Standard Sty',
    body: 'Three fixed statuses, zero ceremony. Automated cycles roll unfinished work forward so nobody manages sprints by hand. For teams that just want to move.',
  },
  {
    image: guidedImg,
    label: 'Guided',
    subtitle: 'DIY Pasture',
    body: 'Design your own statuses, name them anything, group them by category. Tasks move freely — the workflow is yours to shape, not fight.',
  },
  {
    image: enforcedImg,
    label: 'Enforced',
    subtitle: 'Hydraulic Labyrinth',
    body: 'Custom statuses plus admin-defined transition rules. Work moves only along approved paths — built for QA gates, compliance, and release flows.',
  },
]

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: SquareKanban,
    title: 'Boards, sprints, backlog',
    body: 'Drag tasks across the board, plan work into sprints, keep the rest in the backlog. Three workflow modes, from free-form to enforced transitions.',
  },
  {
    icon: Users,
    title: 'Realtime descriptions',
    body: 'Task descriptions are collaborative documents — several people can type at once and every change syncs live. CRDT-backed, so concurrent edits merge instead of colliding.',
  },
  {
    icon: GitBranch,
    title: 'Git integration',
    body: 'Connect GitHub, GitLab, or Bitbucket over webhooks. Branches named from the task key link commits and pull requests back to the task automatically.',
  },
  {
    icon: BarChart3,
    title: 'Charts & forecasting',
    body: 'Burndown, cumulative flow, cycle time, and velocity out of the box. Forecasts come from your team’s measured throughput, not gut feel.',
  },
  {
    icon: Search,
    title: 'Fast search',
    body: 'Full-text search with typo tolerance across every project you can see, plus a structured @field:value filter language for precise queries.',
  },
  {
    icon: Server,
    title: 'Self-hostable',
    body: 'One docker compose up starts the whole stack — app, database, cache, storage, search. Your data stays on your hardware.',
  },
]

function ScreenshotCard({
  src,
  alt,
  caption,
  eager = false,
}: {
  src: string
  alt: string
  caption?: string
  eager?: boolean
}) {
  return (
    <figure className="min-w-0">
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden shadow-[0_0_80px_-20px_rgba(124,106,247,0.45)]">
        <img
          src={src}
          alt={alt}
          width={2880}
          height={1800}
          loading={eager ? 'eager' : 'lazy'}
          className="block w-full h-auto"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-gray-500 text-center">{caption}</figcaption>
      )}
    </figure>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            className="h-8 w-8 object-contain drop-shadow-[0_0_12px_rgba(124,106,247,0.7)]"
          />
          <span className="text-xl font-bold text-brand">Orbit</span>
        </div>
        {localStorage.getItem('access_token') ? (
          <Link
            to="/"
            className="text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
          >
            Open app
          </Link>
        ) : (
          <Link
            to="/login"
            className="text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
          >
            Sign in
          </Link>
        )}
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8">
        {/* Hero */}
        <section className="pt-8 sm:pt-12 pb-12 sm:pb-16 text-center">
          <img
            src="/landing/pig-flag.png"
            alt="The Orbit pig, flag planted on a small moon beside a landed rocket"
            loading="eager"
            className="mx-auto w-64 sm:w-80 h-auto rounded-2xl border border-gray-800/60 shadow-[0_0_60px_-15px_rgba(124,106,247,0.5)]"
          />
          <h1 className="mt-8 text-3xl sm:text-5xl font-bold tracking-tight text-gray-50">
            Task tracking for teams that ship.
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base text-gray-400 leading-relaxed">
            Orbit is a self-hostable kanban tracker with sprints, realtime collaborative
            editing, and Git integration. Run it on your own infrastructure with one command.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/register"
              className="w-full sm:w-auto text-center bg-brand hover:bg-brand-hover text-white font-semibold text-sm px-6 py-3 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>

          <div className="mt-12">
            <ScreenshotCard
              src="/landing/01-kanban.png"
              alt="Orbit kanban board with columns, swimlane toolbar, and task cards"
              eager
            />
          </div>
        </section>

        {/* Feature grid */}
        <section aria-label="Features" className="pb-12 sm:pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"
              >
                <Icon size={20} className="text-brand" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-semibold text-gray-100">{title}</h2>
                <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow modes */}
        <section aria-label="Workflow modes" className="pb-12 sm:pb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-50">
            Three ways to run a board.
          </h2>
          <p className="mt-3 max-w-xl mx-auto text-center text-sm text-gray-400">
            Every team argues about process. Orbit doesn't pick a side — each project
            chooses its own mode, from zero rules to fully enforced transitions.
          </p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {MODES.map(({ image, label, subtitle, body }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                <img src={image} alt={`${label} mode illustrated as a pig farm in space`} loading="lazy" className="w-full h-auto" />
                <div className="p-5">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-gray-100">{label}</h3>
                    <span className="text-[11px] uppercase tracking-wide text-brand/80">{subtitle}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Secondary screenshots */}
        <section aria-label="More screenshots" className="pb-16 sm:pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ScreenshotCard
              src="/landing/02-task-detail.png"
              alt="Task detail view with description, comments, and activity"
              caption="Task detail — collaborative description, comments, activity, linked branches."
            />
            <ScreenshotCard
              src="/landing/05-swimlanes.png"
              alt="Kanban board grouped into swimlanes"
              caption="Swimlanes — group the board by assignee, priority, type, or epic."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 flex items-center justify-between text-sm text-gray-500">
          <span>&copy; Orbit</span>
          <Link to="/help" className="hover:text-gray-300 transition-colors">
            Help &amp; docs
          </Link>
        </div>
      </footer>
    </div>
  )
}
