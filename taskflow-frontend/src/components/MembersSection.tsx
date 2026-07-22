// REQ-165 — members management, embedded as a Project Settings tab.
// Extracted verbatim from the former standalone MembersPage: list is visible to
// every role; invite/role/remove actions stay admin-gated (no RBAC change).
import { useState } from 'react'
import { UserX, Check, X } from 'lucide-react'
import { useMe } from '../hooks/useAuth'
import { useMembers, useInviteMember, useRemoveMember, usePromoteMember } from '../hooks/useMembers'
import type { MemberRole } from '../types'

const ADMIN_ROLES: MemberRole[] = ['admin', 'member', 'viewer']
const MEMBER_ROLES: MemberRole[] = ['member', 'viewer']

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'text-yellow-400',
  admin: 'text-brand',
  member: 'text-gray-300',
  viewer: 'text-gray-500',
}

interface MemberRowProps {
  m: { id: string; email: string; username: string | null; joined_at: string | null; role: MemberRole }
  isSelf: boolean
  canManage: boolean
  isOwner: boolean
  confirmRemoveId: string | null
  onRoleChange: (userId: string, role: MemberRole) => void
  onRemove: (userId: string) => void
  onCancelRemove: () => void
}

function computeCanEdit(canManage: boolean, isSelf: boolean, isTargetOwner: boolean, isTargetAdmin: boolean, isOwner: boolean): boolean {
  return canManage && !isSelf && !isTargetOwner && (isOwner || !isTargetAdmin)
}

function MemberRow({ m, isSelf, canManage, isOwner, confirmRemoveId, onRoleChange, onRemove, onCancelRemove }: MemberRowProps) {
  const isTargetOwner = m.role === 'owner'
  const isTargetAdmin = m.role === 'admin'
  const canEdit = computeCanEdit(canManage, isSelf, isTargetOwner, isTargetAdmin, isOwner)
  const availableRoles = isOwner ? ADMIN_ROLES : MEMBER_ROLES

  return (
    <li className="flex items-center gap-2 md:gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 truncate">{m.email}</p>
        {m.username && <p className="text-xs text-gray-500 truncate">@{m.username}</p>}
        {m.joined_at && (
          <p className="text-xs text-gray-600">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
        )}
      </div>

      {canEdit ? (
        <select
          value={m.role}
          onChange={(e) => onRoleChange(m.id, e.target.value as MemberRole)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-brand"
        >
          {availableRoles.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      ) : (
        <span className={`text-xs font-medium ${ROLE_COLORS[m.role]}`}>
          {ROLE_LABEL[m.role]}
        </span>
      )}

      {canEdit && (
        confirmRemoveId === m.id ? (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Confirm remove" onClick={() => onRemove(m.id)} className="text-red-400 hover:text-red-300 transition-colors">
              <Check size={16} />
            </button>
            <button type="button" aria-label="Cancel remove" onClick={onCancelRemove} className="text-gray-500 hover:text-gray-300 transition-colors">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button type="button" aria-label={`Remove ${m.email}`} onClick={() => onRemove(m.id)} className="text-gray-600 hover:text-red-400 transition-colors">
            <UserX size={16} />
          </button>
        )
      )}
    </li>
  )
}

export default function MembersSection({ projectId }: { projectId: string }) {
  const { data: me } = useMe()
  const { data: members = [] } = useMembers(projectId)
  const invite = useInviteMember(projectId)
  const remove = useRemoveMember(projectId)
  const promote = usePromoteMember(projectId)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const currentMember = members.find((m) => m.id === me?.id)
  const isOwner = currentMember?.role === 'owner'
  const isAdmin = currentMember?.role === 'admin'
  const canManage = isOwner || isAdmin

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviteError('')
    try {
      await invite.mutateAsync(inviteEmail.trim())
      setInviteEmail('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      setInviteError(msg ?? 'Invite failed.')
    }
  }

  async function handleRoleChange(userId: string, role: MemberRole) {
    setActionError('')
    try {
      await promote.mutateAsync({ userId, role })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      setActionError(msg ?? 'Failed to update role.')
    }
  }

  async function handleRemove(userId: string) {
    if (confirmRemoveId !== userId) {
      setConfirmRemoveId(userId)
      return
    }
    setConfirmRemoveId(null)
    setActionError('')
    try {
      await remove.mutateAsync(userId)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      setActionError(msg ?? 'Failed to remove member.')
    }
  }

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      {canManage && (
        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Invite Member
          </h2>
          <form onSubmit={handleInvite} className="flex flex-wrap gap-3">
            <input
              type="email"
              placeholder="Invite by email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 min-w-[10rem] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={invite.isPending}
              className="flex-shrink-0 whitespace-nowrap bg-brand hover:bg-brand-hover text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            >
              {invite.isPending ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
          {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
        </section>
      )}

      {actionError && (
        <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{actionError}</p>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          Members ({members.length})
        </h2>
        <ul className="divide-y divide-gray-800">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              m={m}
              isSelf={m.id === me?.id}
              canManage={canManage}
              isOwner={isOwner}
              confirmRemoveId={confirmRemoveId}
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
              onCancelRemove={() => setConfirmRemoveId(null)}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}
