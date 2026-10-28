import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DeveloperCredit } from '@/components/DeveloperCredit'

type PrivacyRequest = {
  id: string
  request_type: 'ACCESS' | 'CORRECT' | 'DELETE' | 'WITHDRAW_CONSENT' | 'COMPLAINT'
  email: string
  registration_id: string | null
  details: string
  status: 'RECEIVED' | 'IN_REVIEW' | 'NEEDS_VERIFICATION' | 'COMPLETED' | 'DECLINED'
  resolution_note: string
  created_at: string
  updated_at: string
}
type AuditEntry = {
  action: string
  old_status: string | null
  new_status: string | null
  note: string
  actor: string
  created_at: string
}
const statuses: PrivacyRequest['status'][] = ['RECEIVED', 'IN_REVIEW', 'NEEDS_VERIFICATION', 'COMPLETED', 'DECLINED']
const requestLabels: Record<PrivacyRequest['request_type'], string> = {
  ACCESS: 'Access / जानकारी प्राप्त करना',
  CORRECT: 'Correction / सुधार',
  DELETE: 'Deletion / हटाने का अनुरोध',
  WITHDRAW_CONSENT: 'Withdraw consent / सहमति वापस लेना',
  COMPLAINT: 'Complaint / शिकायत',
}
function displayDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function PrivacyRequestsAdmin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('nhym_admin_token') || '')
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { status: PrivacyRequest['status']; note: string }>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadRequests = useCallback(async () => {
    const currentToken = sessionStorage.getItem('nhym_admin_token') || ''
    if (!currentToken) {
      window.location.href = '/login?role=admin'
      return
    }
    setToken(currentToken)
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/privacy-requests', { headers: { authorization: `Bearer ${currentToken}` }, cache: 'no-store' })
      const data = await response.json() as { requests?: PrivacyRequest[]; error?: string }
      if (response.status === 401) {
        sessionStorage.removeItem('nhym_admin_token')
        window.location.href = '/login?role=admin'
        return
      }
      if (!response.ok) throw new Error(data.error || 'Privacy requests could not be loaded.')
      const list = Array.isArray(data.requests) ? data.requests : []
      setRequests(list)
      setDrafts(current => {
        const next = { ...current }
        for (const item of list) if (!next[item.id]) next[item.id] = { status: item.status, note: item.resolution_note || '' }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Privacy requests could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRequests() }, [loadRequests])

  async function loadAudit(id: string) {
    setSelectedId(id)
    setAuditLoading(true)
    setAudit([])
    setError('')
    try {
      const response = await fetch(`/api/admin/privacy-requests/${encodeURIComponent(id)}/audit`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await response.json() as { audit?: AuditEntry[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Audit history could not be loaded.')
      setAudit(Array.isArray(data.audit) ? data.audit : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit history could not be loaded.')
    } finally {
      setAuditLoading(false)
    }
  }

  async function saveStatus(item: PrivacyRequest) {
    const draft = drafts[item.id]
    if (!draft) return
    if (draft.status === 'COMPLETED' && !draft.note.trim()) {
      setError('Before marking a request completed, add a short resolution note.')
      return
    }
    if (!window.confirm('Confirm this status update? Verify the requester before disclosing or changing personal data. This screen records the decision; it does not automatically export, correct, or delete participant data.')) return
    setSavingId(item.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/admin/privacy-requests/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ status: draft.status, resolutionNote: draft.note }),
      })
      const data = await response.json() as { error?: string; status?: PrivacyRequest['status'] }
      if (!response.ok) throw new Error(data.error || 'Status could not be updated.')
      setNotice('Privacy request status updated. Remember to carry out and document any required action manually.')
      await loadRequests()
      if (selectedId === item.id) await loadAudit(item.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status could not be updated.')
    } finally {
      setSavingId('')
    }
  }

  function logout() {
    sessionStorage.removeItem('nhym_admin_token')
    window.location.href = '/login?role=admin'
  }

  return <main className="min-h-dvh bg-background px-gutter py-8">
    <div className="mx-auto max-w-content space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">NHYM 2026 · Main Admin only</p>
          <h1 className="mt-1 text-3xl font-bold">Privacy Requests</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Review access, correction, deletion, consent withdrawal and complaint requests. Status changes are logged; they do not automatically change or delete participant records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { window.location.href = '/admin' }}>Admin Dashboard</Button>
          <Button variant="outline" onClick={() => void loadRequests()} disabled={loading}>Refresh</Button>
          <Button variant="outline" onClick={logout}>Logout</Button>
        </div>
      </header>
      {error && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="rounded-lg border p-3 text-sm">{notice}</div>}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Incoming requests</h2>
          <span className="text-sm text-muted-foreground">{requests.length} shown · maximum 200 most recent</span>
        </div>
        {loading ? <p className="py-8 text-sm text-muted-foreground">Loading requests…</p> : requests.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No privacy requests have been submitted.</p> : <div className="mt-4 space-y-4">
          {requests.map(item => {
            const draft = drafts[item.id] || { status: item.status, note: item.resolution_note || '' }
            return <article key={item.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-semibold">{requestLabels[item.request_type] || item.request_type}</p>
                  <p className="mt-1 break-all text-sm">{item.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Reference: {item.id}{item.registration_id ? ` · Registration: ${item.registration_id}` : ''}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Received: {displayDate(item.created_at)} · Updated: {displayDate(item.updated_at)}</p>
                </div>
                <span className="rounded-full border px-3 py-1 text-xs font-medium">{item.status.replaceAll('_', ' ')}</span>
              </div>
              {item.details && <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-sm">{item.details}</p>}
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <label className="text-sm font-medium">Status
                  <select value={draft.status} onChange={e => setDrafts(current => ({ ...current, [item.id]: { ...draft, status: e.target.value as PrivacyRequest['status'] } }))} className="mt-1 w-full rounded-md border bg-background px-3 py-2">
                    {statuses.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">Resolution / internal note
                  <textarea value={draft.note} maxLength={1000} onChange={e => setDrafts(current => ({ ...current, [item.id]: { ...draft, note: e.target.value } }))} rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Record verification and decision; avoid unnecessary sensitive details." />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void saveStatus(item)} disabled={savingId === item.id}>{savingId === item.id ? 'Saving…' : 'Save status'}</Button>
                <Button variant="outline" onClick={() => void loadAudit(item.id)} disabled={auditLoading && selectedId === item.id}>{auditLoading && selectedId === item.id ? 'Loading history…' : 'View audit history'}</Button>
              </div>
              {selectedId === item.id && <div className="mt-4 rounded-md border bg-muted/20 p-3">
                <h3 className="font-semibold">Audit history</h3>
                {auditLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : audit.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No audit entries found.</p> : <ol className="mt-2 space-y-2">
                  {audit.map((entry, index) => <li key={`${entry.created_at}-${index}`} className="border-l-2 pl-3 text-sm">
                    <p className="font-medium">{entry.action.replaceAll('_', ' ')}{entry.new_status ? ` · ${entry.old_status ? `${entry.old_status} → ` : ''}${entry.new_status}` : ''}</p>
                    {entry.note && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{entry.note}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{displayDate(entry.created_at)}{entry.actor ? ` · Actor: ${entry.actor}` : ''}</p>
                  </li>)}
                </ol>}
              </div>}
            </article>
          })}
        </div>}
      </section>
      <aside className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 text-sm">
        <strong>Privacy reminder:</strong> Verify the requester proportionately before disclosing or changing data. Check retention duties and active disputes before deletion. The workflow stores a request and audit history only; the LOC must perform approved actions in each relevant system and document the response.
      </aside>
      <DeveloperCredit />
    </div>
  </main>
}
