import { useCallback, useState } from 'react'
import { Meta } from '@/components/Meta'
import { Brand } from '@/components/Brand'
import { DeveloperCredit } from '@/components/DeveloperCredit'

type PrivacyRequest = {
  id: string
  request_type: string
  email: string
  registration_id: string | null
  details: string
  status: string
  resolution_note: string
  verification_status: string
  verification_method: string
  verified_at: string | null
  verified_by: string | null
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
type AccessAuditEntry = {
  actor: string
  action: string
  endpoint: string
  outcome: string
  request_trace: string
  created_at: string
}
const statuses = ['RECEIVED', 'IN_REVIEW', 'NEEDS_VERIFICATION', 'COMPLETED', 'DECLINED']
const requestLabels: Record<string, string> = {
  ACCESS: 'Access to personal data',
  CORRECT: 'Correction of personal data',
  DELETE: 'Deletion request',
  WITHDRAW_CONSENT: 'Withdraw consent',
  COMPLAINT: 'Complaint',
}
function dateLabel(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function PrivacyRequestsAdmin() {
  const [token, setToken] = useState('')
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [nextStatus, setNextStatus] = useState('IN_REVIEW')
  const [nextVerificationStatus, setNextVerificationStatus] = useState('UNVERIFIED')
  const [nextVerificationMethod, setNextVerificationMethod] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [accessAudit, setAccessAudit] = useState<AccessAuditEntry[]>([])
  const [accessAuditLoading, setAccessAuditLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = requests.find((item) => item.id === selectedId)

  const loadRequests = useCallback(async (authToken = token) => {
    if (!authToken.trim()) {
      setError('Admin access key दर्ज करें.')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/privacy-requests', {
        headers: { authorization: `Bearer ${authToken.trim()}` },
        cache: 'no-store',
      })
      const result = await response.json() as { requests?: PrivacyRequest[]; error?: string }
      if (!response.ok) throw new Error(response.status === 401 ? 'Admin access key सही नहीं है या अनुमति नहीं है.' : result.error || 'Privacy requests लोड नहीं हो सके.')
      const rows = Array.isArray(result.requests) ? result.requests : []
      setRequests(rows)
      const selectedRow = rows.find((item) => item.id === selectedId) ?? rows[0]
      setSelectedId(selectedRow?.id ?? '')
      if (selectedRow) {
        setNextStatus(selectedRow.status || 'RECEIVED')
        setNextVerificationStatus(selectedRow.verification_status || 'UNVERIFIED')
        setNextVerificationMethod(selectedRow.verification_method || '')
        setResolutionNote(selectedRow.resolution_note || '')
      }
      setNotice(`कुल ${rows.length} अनुरोध लोड हुए. अधिकतम 200 नवीनतम अनुरोध दिखाए जाते हैं.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Privacy requests लोड नहीं हो सके.')
      setRequests([])
      setAudit([])
      setSelectedId('')
    } finally {
      setLoading(false)
    }
  }, [token, selectedId])

  const loadAudit = useCallback(async (id: string, authToken = token) => {
    if (!id || !authToken.trim()) return
    try {
      const response = await fetch(`/api/admin/privacy-requests/${encodeURIComponent(id)}/audit`, {
        headers: { authorization: `Bearer ${authToken.trim()}` },
        cache: 'no-store',
      })
      const result = await response.json() as { audit?: AuditEntry[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Audit history लोड नहीं हुई.')
      setAudit(Array.isArray(result.audit) ? result.audit : [])
    } catch (e) {
      setAudit([])
      setError(e instanceof Error ? e.message : 'Audit history लोड नहीं हुई.')
    }
  }, [token])

  async function chooseRequest(id: string) {
    setSelectedId(id)
    setAudit([])
    const item = requests.find((row) => row.id === id)
    setNextStatus(item?.status || 'RECEIVED')
    setNextVerificationStatus(item?.verification_status || 'UNVERIFIED')
    setNextVerificationMethod(item?.verification_method || '')
    setResolutionNote(item?.resolution_note || '')
    await loadAudit(id)
  }

  async function updateRequest() {
    if (!selected || !token.trim()) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/admin/privacy-requests/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token.trim()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          resolutionNote,
          verificationStatus: nextVerificationStatus,
          verificationMethod: nextVerificationStatus === 'VERIFIED' ? nextVerificationMethod : '',
        }),
      })
      const result = await response.json() as { ok?: boolean; error?: string; status?: string; verificationStatus?: string; verificationMethod?: string; verifiedAt?: string | null }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Request status update नहीं हुआ.')
      setRequests((rows) => rows.map((row) => row.id === selected.id
        ? {
            ...row,
            status: nextStatus,
            resolution_note: resolutionNote,
            verification_status: result.verificationStatus || nextVerificationStatus,
            verification_method: result.verificationMethod || (nextVerificationStatus === 'VERIFIED' ? nextVerificationMethod : ''),
            verified_at: result.verifiedAt ?? row.verified_at,
            updated_at: new Date().toISOString(),
          }
        : row))
      setNotice('अनुरोध की स्थिति अपडेट हुई और audit history में दर्ज की गई.')
      await loadAudit(selected.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request status update नहीं हुआ.')
    } finally {
      setSaving(false)
    }
  }

  async function loadAccessAudit() {
    if (!token.trim()) {
      setError('Admin access key दर्ज करें.')
      return
    }
    setAccessAuditLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/privacy-access-audit', {
        headers: { authorization: `Bearer ${token.trim()}` },
        cache: 'no-store',
      })
      const result = await response.json() as { entries?: AccessAuditEntry[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Sensitive-data access audit लोड नहीं हुई.')
      setAccessAudit(Array.isArray(result.entries) ? result.entries : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sensitive-data access audit लोड नहीं हुई.')
      setAccessAudit([])
    } finally {
      setAccessAuditLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Meta title="Privacy Request Management | NHYM 2026" description="Restricted administrative workspace for reviewing privacy requests submitted to the NHYM 2026 LOC." />
      <header className="border-b px-gutter py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Brand />
          <a className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted" href="/admin">Admin Dashboard</a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-gutter py-8">
        <section className="space-y-2">
          <p className="text-sm text-muted-foreground">Restricted administrative access</p>
          <h1 className="text-3xl font-bold">Privacy Request Management</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Access, correction, deletion, consent-withdrawal और complaint अनुरोधों की समीक्षा करें। अनुरोध जमा होने से डेटा अपने-आप नहीं बदलता या हटता है। पहचान सत्यापित करने और retention obligations जाँचने के बाद ही कार्रवाई करें।</p>
        </section>

        <form className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void loadRequests() }}>
          <label className="flex-1 space-y-1 text-sm font-medium">
            Admin access key
            <input type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Enter Admin access key" required />
          </label>
          <button className="self-end rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50" type="submit" disabled={loading}>{loading ? 'Loading…' : 'Load requests'}</button>
        </form>

        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-green-700/30 bg-green-700/5 p-3 text-sm">{notice}</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Submitted requests</h2>
            {requests.length === 0 ? <p className="rounded-xl border p-5 text-sm text-muted-foreground">अभी कोई request सूची में नहीं है। पहले Admin access key से Load requests करें।</p> : (
              <div className="space-y-2">
                {requests.map((item) => (
                  <button type="button" key={item.id} onClick={() => void chooseRequest(item.id)} className={`block w-full rounded-xl border p-4 text-left transition hover:bg-muted/60 ${selectedId === item.id ? 'border-primary bg-muted/40' : 'bg-card'}`}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{requestLabels[item.request_type] || item.request_type}</span>
                      <span className="rounded-full border px-2 py-1 text-xs">{item.status}</span>
                    </span>
                    <span className="mt-2 block break-all text-sm">{item.email}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Ref: {item.id} · {dateLabel(item.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Request details &amp; audit</h2>
            {!selected ? <p className="rounded-xl border p-5 text-sm text-muted-foreground">विवरण देखने के लिए बाईं ओर से request चुनें।</p> : (
              <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Request type</dt><dd className="mt-1 font-medium">{requestLabels[selected.request_type] || selected.request_type}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Current status</dt><dd className="mt-1 font-medium">{selected.status}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Identity verification</dt><dd className="mt-1 font-medium">{selected.verification_status || 'UNVERIFIED'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Verification method</dt><dd className="mt-1 font-medium">{selected.verification_method || 'Not verified'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 break-all">{selected.email}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Registration ID</dt><dd className="mt-1 break-all">{selected.registration_id || 'Not supplied'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Details supplied by requester</dt><dd className="mt-1 whitespace-pre-wrap break-words">{selected.details || 'No additional details supplied.'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Received</dt><dd className="mt-1">{dateLabel(selected.created_at)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1">{dateLabel(selected.updated_at)}</dd></div>
                </dl>

                {selected.request_type === 'CORRECT' && selected.verification_status === 'VERIFIED' && selected.status !== 'COMPLETED' && (
                  <div className="rounded-lg border border-primary/30 bg-muted/30 p-4">
                    <h3 className="font-semibold">Correction action</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Identity verification is recorded. Open Manage Participants to review and correct the matching registration. Saving a correction requires a reason and writes an audit entry; return here to record the outcome before completing the request.</p>
                    <a className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground" href={`/admin/participants?search=${encodeURIComponent(selected.email)}&privacyRequestId=${encodeURIComponent(selected.id)}`}>Open participant record for correction</a>
                  </div>
                )}
                <div className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold">Review decision</h3>
                  <label className="block space-y-1 text-sm font-medium">Identity verification status
                    <select className="w-full rounded-lg border bg-background px-3 py-2 font-normal" value={nextVerificationStatus} onChange={(event) => {
                      const value = event.target.value
                      setNextVerificationStatus(value)
                      if (value !== 'VERIFIED') setNextVerificationMethod('')
                    }}>
                      <option value="UNVERIFIED">UNVERIFIED</option>
                      <option value="PENDING">PENDING — awaiting evidence</option>
                      <option value="VERIFIED">VERIFIED</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </label>
                  {nextVerificationStatus === 'VERIFIED' && <label className="block space-y-1 text-sm font-medium">Verification method
                    <select className="w-full rounded-lg border bg-background px-3 py-2 font-normal" value={nextVerificationMethod} onChange={(event) => setNextVerificationMethod(event.target.value)} required>
                      <option value="">Choose a method</option>
                      <option value="REGISTRATION_DETAILS">Match registration details</option>
                      <option value="CALLBACK_KNOWN_CONTACT">Callback to known contact</option>
                      <option value="IN_PERSON">In-person verification</option>
                      <option value="OTHER">Other proportionate method</option>
                    </select>
                  </label>}
                  <p className="text-xs text-muted-foreground">Do not upload or paste identity documents into this system. Record only the verification method and outcome. Completion is blocked until identity is marked VERIFIED; deletion/correction still has to be carried out manually after retention review.</p>
                  <label className="block space-y-1 text-sm font-medium">Status
                    <select className="w-full rounded-lg border bg-background px-3 py-2 font-normal" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                      {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1 text-sm font-medium">Resolution / internal note
                    <textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 font-normal" maxLength={1000} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Record verification outcome, action taken, or reason for decline. Do not enter unnecessary sensitive data." />
                  </label>
                  <button type="button" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={saving} onClick={() => void updateRequest()}>{saving ? 'Saving…' : 'Save status & audit note'}</button>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Audit history</h3>
                    <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void loadAudit(selected.id)} disabled={!token || loading}>Refresh</button>
                  </div>
                  {audit.length === 0 ? <p className="text-sm text-muted-foreground">Audit entries नहीं मिलीं या अभी लोड नहीं हुई हैं।</p> : (
                    <ol className="space-y-3">
                      {audit.map((entry, index) => (
                        <li key={`${entry.created_at}-${index}`} className="rounded-lg border p-3 text-sm">
                          <p className="font-medium">{entry.action}{entry.old_status || entry.new_status ? ` · ${entry.old_status || '—'} → ${entry.new_status || '—'}` : ''}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{dateLabel(entry.created_at)} · Actor: {entry.actor || 'admin-token'}</p>
                          {entry.note && <p className="mt-2 whitespace-pre-wrap break-words">{entry.note}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold">Sensitive-data access audit</h3>
                    <button type="button" className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50" onClick={() => void loadAccessAudit()} disabled={!token || accessAuditLoading}>{accessAuditLoading ? 'Loading…' : 'Load access audit'}</button>
                  </div>
                  <p className="text-xs text-muted-foreground">Shows logged Admin reads of registration data used for participant CSV/PDF reports, plus successful and unmatched Participant Portal lookups. The shared Admin token cannot identify which individual used it.</p>
                  {accessAudit.length === 0 ? <p className="text-sm text-muted-foreground">Access audit अभी लोड नहीं हुई या कोई entry उपलब्ध नहीं है।</p> : (
                    <ol className="space-y-2">
                      {accessAudit.map((entry, index) => (
                        <li key={`${entry.created_at}-${index}`} className="rounded-lg border p-3 text-sm">
                          <p className="font-medium">{entry.action} · {entry.outcome}</p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">{entry.endpoint} · {entry.actor} · {dateLabel(entry.created_at)}</p>
                          {entry.request_trace && <p className="mt-1 text-xs text-muted-foreground">Request trace: {entry.request_trace}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
        <p className="text-xs text-muted-foreground">Security note: access key is held only in this page's memory and is not saved to local storage. Sign out by leaving the page. This page is a workflow tool, not an automatic identity-verification or deletion system.</p>
      </main>
      <footer className="border-t px-gutter py-5"><div className="mx-auto max-w-6xl"><DeveloperCredit /></div></footer>
    </div>
  )
}
