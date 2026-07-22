// REQ-165 — members management moved to Project Settings → Members.
// This route survives purely so old links and bookmarks never 404.
import { Navigate, useParams } from 'react-router-dom'

export default function MembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  return <Navigate to={`/projects/${workspaceId}/settings?tab=members`} replace />
}
