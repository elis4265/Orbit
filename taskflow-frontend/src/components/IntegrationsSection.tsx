import { useState } from 'react'
import { vcsApi } from '../api/client'
import {
  useProviders,
  useVcsConnections,
  useCreateVcsConnection,
  useDeleteVcsConnection,
} from '../hooks/useVcs'
import type { DeviceStart, VcsConnectionCreated, VcsProvider } from '../types'

const LABEL: Record<VcsProvider, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' }

export default function IntegrationsSection({ projectId }: { projectId: string }) {
  const { data: providers } = useProviders()
  const { data: connections = [] } = useVcsConnections(projectId)
  const createConn = useCreateVcsConnection(projectId)
  const deleteConn = useDeleteVcsConnection(projectId)

  const [provider, setProvider] = useState<VcsProvider>('github')
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState('')
  const [created, setCreated] = useState<VcsConnectionCreated | null>(null)
  const [device, setDevice] = useState<DeviceStart | null>(null)
  const [deviceMsg, setDeviceMsg] = useState('')

  const meta = providers?.providers
  const isToken = provider === 'bitbucket'

  const submit = async () => {
    if (!repo.trim()) return
    const result = await createConn.mutateAsync({
      provider, repo_identifier: repo.trim(), token: isToken ? token : undefined,
    })
    setCreated(result)
    setRepo(''); setToken('')
  }

  const authorize = async () => {
    if (!created) return
    setDeviceMsg('')
    const d = await vcsApi.deviceStart(projectId, created.id)
    setDevice(d)
  }

  const checkAuth = async () => {
    if (!created || !device) return
    const res = await vcsApi.devicePoll(projectId, created.id, device.device_code)
    setDeviceMsg(res.status === 'connected' ? 'Connected!' : `Still waiting (${res.error || 'pending'})…`)
  }

  return (
    <div className="space-y-6">
      {/* Connect form */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">Connect a repository</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            aria-label="Provider"
            value={provider}
            onChange={(e) => { setProvider(e.target.value as VcsProvider); setCreated(null); setDevice(null) }}
            className="border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-600"
          >
            {(['github', 'gitlab', 'bitbucket'] as VcsProvider[]).map((p) => (
              <option key={p} value={p}>{LABEL[p]}</option>
            ))}
          </select>
          <input
            aria-label="Repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo"
            className="border rounded px-2 py-1 flex-1 min-w-[12rem] dark:bg-gray-800 dark:border-gray-600"
          />
          {isToken && (
            <input
              aria-label="Access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Workspace/repo access token"
              type="password"
              className="border rounded px-2 py-1 flex-1 min-w-[12rem] dark:bg-gray-800 dark:border-gray-600"
            />
          )}
          <button
            onClick={submit}
            disabled={!repo.trim() || createConn.isPending}
            className="px-3 py-1 rounded bg-[#7c6af7] text-white disabled:opacity-50"
          >
            Create
          </button>
        </div>
        {meta && !meta[provider].device_flow && provider !== 'bitbucket' && (
          <p className="text-xs text-amber-600">
            {LABEL[provider]} OAuth isn’t configured on this server — you can still finish by pasting the
            webhook below into {LABEL[provider]} manually.
          </p>
        )}
      </div>

      {/* Post-create: webhook + (device flow) authorize */}
      {created && (
        <div className="border border-[#7c6af7]/40 rounded-lg p-4 space-y-3" data-testid="connect-next-steps">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Connection created. Add this webhook in {LABEL[created.provider]} → repository settings:
          </p>
          <div className="text-xs font-mono bg-gray-50 dark:bg-gray-800 rounded p-2 break-all">
            <div><span className="text-gray-400">URL: </span>{created.webhook_url}</div>
            <div><span className="text-gray-400">Secret: </span>{created.webhook_secret}</div>
          </div>

          {meta?.[created.provider].device_flow && (
            <div className="space-y-2">
              <button onClick={authorize} className="px-3 py-1 rounded border border-[#7c6af7] text-[#7c6af7] text-sm">
                Authorize with {LABEL[created.provider]}
              </button>
              {device && (
                <div className="text-sm space-y-1">
                  <p>
                    Enter code <span className="font-mono font-bold">{device.user_code}</span> at{' '}
                    <a href={device.verification_uri} target="_blank" rel="noreferrer" className="text-[#7c6af7] underline">
                      {device.verification_uri}
                    </a>
                  </p>
                  <button onClick={checkAuth} className="px-2 py-1 rounded bg-[#7c6af7] text-white text-xs">
                    Check authorization
                  </button>
                  {deviceMsg && <span className="ml-2 text-xs text-gray-500">{deviceMsg}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Existing connections */}
      <div>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Connections</h3>
        {connections.length === 0 ? (
          <p className="text-sm text-gray-400">No repositories connected.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-medium">{LABEL[c.provider]}</span>
                <span className="text-gray-500 font-mono text-xs">{c.repo_identifier}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.connected ? 'token stored' : 'webhook only'}
                </span>
                <button
                  onClick={() => deleteConn.mutate(c.id)}
                  className="ml-auto text-xs text-rose-600 hover:underline"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
