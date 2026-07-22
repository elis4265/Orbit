import { useState } from 'react'
import { useDevLinks } from '../hooks/useVcs'
import type { TaskDevLink } from '../types'

const KIND_ICON: Record<TaskDevLink['kind'], string> = { branch: '⎇', commit: '●', pr: '⇄' }
const STATE_STYLE: Record<TaskDevLink['state'], string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  merged: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  closed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}
const PROVIDER_GLYPH: Record<string, string> = { github: '', gitlab: '', bitbucket: '', '': '' }

interface Props {
  projectId: string
  taskId: string
  branchSuggestion?: string
}

// The text shown for a link: PRs lead with their number, branches/commits use the
// title, and a commit with no title falls back to a short SHA.
export function devLinkLabel(l: TaskDevLink): string {
  const prefix = l.kind === 'pr' && l.number ? `#${l.number} ` : ''
  return `${prefix}${l.title || l.external_id.slice(0, 8)}`
}

// Group links by repo so multiple repos are never ambiguous (YouTrack "VCS changes").
function groupByRepo(links: TaskDevLink[]): [string, TaskDevLink[]][] {
  const groups = new Map<string, TaskDevLink[]>()
  for (const l of links) {
    const key = l.repo_identifier || 'repository'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l)
  }
  return [...groups.entries()]
}

// HW-26: within a repo, group by kind so a PR and its commits read as a summary
// rather than four near-identical rows. Jira-style order: PRs, then Branches, then
// Commits. Absent kinds produce no section (requirement 5).
const KIND_ORDER: TaskDevLink['kind'][] = ['pr', 'branch', 'commit']
const KIND_LABEL: Record<TaskDevLink['kind'], string> = {
  pr: 'Pull Requests',
  branch: 'Branches',
  commit: 'Commits',
}
function groupByKind(links: TaskDevLink[]): [TaskDevLink['kind'], TaskDevLink[]][] {
  return KIND_ORDER
    .map((k) => [k, links.filter((l) => l.kind === k)] as [TaskDevLink['kind'], TaskDevLink[]])
    .filter(([, ls]) => ls.length > 0)
}

export default function DevelopmentSection({ projectId, taskId, branchSuggestion }: Props) {
  const { data: links = [], isLoading } = useDevLinks(projectId, taskId)
  const [copied, setCopied] = useState(false)

  const copyBranch = async () => {
    if (!branchSuggestion) return
    await navigator.clipboard.writeText(branchSuggestion)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const grouped = groupByRepo(links)

  return (
    <div className="space-y-2" data-testid="development-section">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Development</h3>
        {branchSuggestion && (
          <button
            onClick={copyBranch}
            className="self-start text-[11px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 whitespace-nowrap"
            title={branchSuggestion}
          >
            {copied ? 'Copied!' : 'Copy branch name'}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-gray-400">
          No linked branches, commits, or pull requests yet.
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([repo, repoLinks]) => (
            <div key={repo} data-testid="dev-repo-group">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 break-words" title={repo}>
                {PROVIDER_GLYPH[repoLinks[0]?.provider ?? ''] || ''}{repo}
              </p>
              {/* HW-26: one labelled section per kind. Branch names are long and the
                  sidebar is ~208px wide, so the name takes the full width and wraps;
                  the state chip — PRs only — sits underneath. A commit or branch has
                  no meaningful open/closed lifecycle, so it carries no chip. */}
              {groupByKind(repoLinks).map(([kind, kindLinks]) => (
                <div key={kind} className="mt-1.5 first:mt-0.5">
                  <p
                    data-testid="dev-kind-header"
                    className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                  >
                    {KIND_LABEL[kind]}
                  </p>
                  <ul className="space-y-1 mt-0.5">
                    {kindLinks.map((l) => (
                      <li key={l.id} className="flex items-start gap-2 text-sm">
                        <span className="text-gray-400 flex-shrink-0 leading-snug" aria-hidden>{KIND_ICON[l.kind]}</span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            title={devLinkLabel(l)}
                            className="block text-[#7c6af7] hover:underline break-words leading-snug"
                          >
                            {devLinkLabel(l)}
                          </a>
                          {l.kind === 'pr' && (
                            <span
                              data-testid="dev-state-chip"
                              className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded uppercase ${STATE_STYLE[l.state]}`}
                            >
                              {l.state}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
