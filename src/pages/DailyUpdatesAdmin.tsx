import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ImagePlus, LogOut, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react'
import { Meta } from '@/components/Meta'
import { DeveloperCredit } from '@/components/DeveloperCredit'

type Photo = { id: string; imageUrl: string; caption: string | null; originalName: string }
type Update = {
  id: string; title: string; body: string; category: string; eventDate: string
  status: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'REJECTED'
  createdByName: string; createdAt: string; publishedAt: string | null
  rejectionNote: string | null; photos: Photo[]
}
type Member = { id: string; displayName: string; loginId: string; isActive: boolean; createdAt: string; lastLoginAt: string | null }
type MemberIdentity = { id: string; displayName: string; loginId: string }

const CATEGORIES = ['General', 'Meetings & Planning', 'Venue & Stage', 'Accommodation', 'Food & Transport', 'Registration', 'Cultural Programme', 'Public Announcement']

export default function DailyUpdatesAdmin() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('nhym_admin_token') || '')
  const [memberToken, setMemberToken] = useState(() => sessionStorage.getItem('nhym_daily_updates_token') || '')
  const [identity, setIdentity] = useState<MemberIdentity | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [updates, setUpdates] = useState<Update[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tab, setTab] = useState<'updates' | 'members'>('updates')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [eventDate, setEventDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [photos, setPhotos] = useState<File[]>([])
  const [publishNow, setPublishNow] = useState(true)
  const [newName, setNewName] = useState('')
  const [newLogin, setNewLogin] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestAdmin(path: string, init: RequestInit = {}) {
    return fetch(path, { ...init, headers: { authorization: `Bearer ${adminToken}`, ...(init.headers || {}) } })
  }

  async function loadAdminData() {
    const [updatesResponse, membersResponse] = await Promise.all([
      requestAdmin('/api/admin/daily-updates'),
      requestAdmin('/api/admin/daily-updates/users'),
    ])
    const updatesResult = await updatesResponse.json() as { updates?: Update[]; error?: string }
    if (!updatesResponse.ok) throw new Error(updatesResult.error || 'Could not load daily updates.')
    setUpdates(updatesResult.updates || [])
    if (membersResponse.ok) {
      const membersResult = await membersResponse.json() as { users?: Member[] }
      setMembers(membersResult.users || [])
    }
  }

  async function checkSession() {
    setChecking(true)
    setError('')
    if (adminToken) {
      try {
        const response = await requestAdmin('/api/admin/daily-updates')
        if (response.ok) {
          const result = await response.json() as { updates?: Update[] }
          setUpdates(result.updates || [])
          setIsAdmin(true)
          setChecking(false)
          void requestAdmin('/api/admin/daily-updates/users').then(async r => {
            if (r.ok) { const data = await r.json() as { users?: Member[] }; setMembers(data.users || []) }
          })
          return
        }
      } catch { /* fall through to member session */ }
    }
    if (memberToken) {
      try {
        const response = await fetch('/api/daily-updates/me', { headers: { authorization: `Bearer ${memberToken}` } })
        const result = await response.json() as { user?: MemberIdentity; error?: string }
        if (response.ok && result.user) {
          setIdentity(result.user)
          setIsAdmin(false)
          setChecking(false)
          return
        }
      } catch { /* show login */ }
      sessionStorage.removeItem('nhym_daily_updates_token')
      setMemberToken('')
    }
    setIsAdmin(false)
    setChecking(false)
  }

  useEffect(() => { void checkSession() }, [])

  async function login(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/daily-updates/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      })
      const result = await response.json() as { token?: string; user?: MemberIdentity; error?: string }
      if (!response.ok || !result.token || !result.user) throw new Error(result.error || 'Login failed.')
      sessionStorage.setItem('nhym_daily_updates_token', result.token)
      sessionStorage.removeItem('nhym_admin_token')
      setAdminToken('')
      setMemberToken(result.token)
      setIdentity(result.user)
      setPassword('')
      setNotice('सफलतापूर्वक लॉगिन हो गया।')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.')
    } finally { setBusy(false) }
  }

  function logout() {
    sessionStorage.removeItem('nhym_daily_updates_token')
    setMemberToken(''); setIdentity(null)
    window.location.href = '/'
  }

  async function submitUpdate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const form = new FormData()
      form.set('title', title.trim())
      form.set('body', body.trim())
      form.set('category', category)
      form.set('eventDate', eventDate)
      photos.forEach(photo => form.append('photos', photo))
      let response: Response
      if (isAdmin) {
        form.set('publishNow', publishNow ? 'true' : 'false')
        response = await requestAdmin('/api/admin/daily-updates', { method: 'POST', body: form })
      } else {
        response = await fetch('/api/daily-updates/submissions', {
          method: 'POST', headers: { authorization: `Bearer ${memberToken}` }, body: form,
        })
      }
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || 'Update could not be submitted.')
      setTitle(''); setBody(''); setPhotos([])
      setNotice(isAdmin && publishNow ? 'अपडेट प्रकाशित कर दिया गया है।' : 'अपडेट Admin की मंजूरी के लिए भेज दिया गया है।')
      if (isAdmin) await loadAdminData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update could not be submitted.')
    } finally { setBusy(false) }
  }

  async function moderate(updateId: string, action: 'approve' | 'reject') {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await requestAdmin(`/api/admin/daily-updates/${encodeURIComponent(updateId)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || 'Could not update status.')
      setNotice(action === 'approve' ? 'अपडेट मंजूर करके प्रकाशित कर दिया गया है।' : 'अपडेट अस्वीकार कर दिया गया है।')
      await loadAdminData()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update status.') }
    finally { setBusy(false) }
  }

  async function createMember(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await requestAdmin('/api/admin/daily-updates/users', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: newName, loginId: newLogin, password: newPassword }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || 'Could not create member account.')
      setNewName(''); setNewLogin(''); setNewPassword('')
      setNotice(result.message || 'अधिकृत सदस्य का खाता बना दिया गया है।')
      await loadAdminData()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create member account.') }
    finally { setBusy(false) }
  }

  async function toggleMember(member: Member) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await requestAdmin(`/api/admin/daily-updates/users/${encodeURIComponent(member.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !member.isActive }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not update member access.')
      setNotice(member.isActive ? 'सदस्य का एक्सेस बंद कर दिया गया है।' : 'सदस्य का एक्सेस चालू कर दिया गया है।')
      await loadAdminData()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update member access.') }
    finally { setBusy(false) }
  }

  if (checking) return <main className="min-h-dvh px-4 py-16 text-center text-muted-foreground">Loading Daily Updates…</main>

  if (!isAdmin && !identity) return (
    <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
      <Meta title="Daily Updates Team Login — NHYM 2026" description="Authorized committee member login for NHYM-26 daily updates." />
      <div className="mx-auto max-w-md">
        <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16} /> मुख्य वेबसाइट</a>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <ShieldCheck className="text-primary" size={30} />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Jamshedpur</p>
          <h1 className="mt-2 text-3xl">Daily Updates Login</h1>
          <p className="mt-2 text-sm text-muted-foreground">यह लॉगिन केवल अधिकृत आयोजन समिति सदस्यों के लिए है।</p>
          <form onSubmit={login} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">Login ID<input value={loginId} onChange={e => setLoginId(e.target.value)} autoComplete="username" required className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /></label>
            <label className="block text-sm font-medium">Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /></label>
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <button disabled={busy} className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Signing in…' : 'Login'}</button>
          </form>
        </div>
        <DeveloperCredit />
      </div>
    </main>
  )

  return (
    <main className="min-h-dvh bg-background px-gutter py-8 text-foreground">
      <Meta title="Daily Updates Management — NHYM 2026" description="Submit, review and publish NHYM-26 daily updates." />
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16} /> मुख्य वेबसाइट</a>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Jamshedpur</p>
            <h1 className="mt-2 text-3xl sm:text-4xl">Daily Updates Management</h1>
            <p className="mt-2 text-muted-foreground">{isAdmin ? 'Admin review, publishing and authorized member access.' : `नमस्कार, ${identity?.displayName}। टेक्स्ट और फोटो के साथ अपडेट भेजें।`}</p>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"><LogOut size={16} /> Logout</button>
        </div>

        {notice && <p role="status" className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</p>}
        {error && <p role="alert" className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

        <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-7">
          <h2 className="text-xl font-semibold">{isAdmin ? 'Create an update' : 'नया दैनिक अपडेट भेजें'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{isAdmin ? 'Admin के रूप में प्रकाशित करें या ड्राफ्ट रखें।' : 'आपका अपडेट समीक्षा के बाद ही सार्वजनिक वेबसाइट पर दिखेगा।'}</p>
          <form onSubmit={submitUpdate} className="mt-5 grid gap-4">
            <label className="block text-sm font-medium">शीर्षक<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">श्रेणी<select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2.5">{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="block text-sm font-medium">तैयारी/गतिविधि की तारीख<input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} required className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /></label>
            </div>
            <label className="block text-sm font-medium">विवरण<textarea value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={10000} required className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" placeholder="आज की तैयारी, कार्य की प्रगति या महत्वपूर्ण सूचना लिखें…" /></label>
            <label className="block text-sm font-medium">फोटो (अधिकतम 5, प्रत्येक 20 MB तक)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => setPhotos(Array.from(e.target.files || []).slice(0, 5))} className="mt-1 block w-full rounded-md border bg-background px-3 py-2.5 text-sm" /></label>
            {photos.length > 0 && <p className="text-sm text-muted-foreground">{photos.length} फोटो चुनी गईं: {photos.map(f => f.name).join(', ')}</p>}
            {isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publishNow} onChange={e => setPublishNow(e.target.checked)} /> मंजूरी के बाद तुरंत सार्वजनिक वेबसाइट पर प्रकाशित करें</label>}
            <button disabled={busy} className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"><ImagePlus size={17} /> {busy ? 'Submitting…' : isAdmin && publishNow ? 'Publish update' : 'Send for Admin approval'}</button>
          </form>
        </section>

        {isAdmin && (
          <section className="mt-8">
            <div className="flex flex-wrap gap-2 border-b pb-3">
              <button onClick={() => setTab('updates')} className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'updates' ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}>Updates ({updates.length})</button>
              <button onClick={() => setTab('members')} className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'members' ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}>Authorized members ({members.length})</button>
              <button onClick={() => { void loadAdminData().catch(e => setError(e instanceof Error ? e.message : 'Refresh failed.')) }} className="ml-auto inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw size={15} /> Refresh</button>
            </div>

            {tab === 'updates' && <div className="mt-4 space-y-4">
              {updates.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">अभी कोई अपडेट नहीं है।</p>}
              {updates.map(update => <article key={update.id} className="rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{update.status}</span>
                  <span className="text-xs text-muted-foreground">{update.category} · {update.eventDate}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">{update.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{update.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">Submitted by {update.createdByName} · {update.photos?.length || 0} photo(s)</p>
                {update.photos?.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{update.photos.map(photo => <img key={photo.id} src={photo.imageUrl} alt={photo.caption || update.title} className="h-28 w-full rounded-lg border object-cover" />)}</div>}
                {update.rejectionNote && <p className="mt-3 text-sm text-destructive">Note: {update.rejectionNote}</p>}
                {update.status !== 'PUBLISHED' && <div className="mt-4 flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => void moderate(update.id, 'approve')} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"><Check size={15} /> Approve & publish</button>
                  {update.status !== 'REJECTED' && <button disabled={busy} onClick={() => void moderate(update.id, 'reject')} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"><X size={15} /> Reject</button>}
                </div>}
              </article>)}
            </div>}

            {tab === 'members' && <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <form onSubmit={createMember} className="h-fit rounded-xl border bg-card p-4 sm:p-5">
                <h3 className="flex items-center gap-2 text-lg font-semibold"><UserPlus size={18} /> Add authorized member</h3>
                <p className="mt-1 text-sm text-muted-foreground">Temporary login details सुरक्षित तरीके से संबंधित सदस्य को दें।</p>
                <label className="mt-4 block text-sm font-medium">पूरा नाम<input value={newName} onChange={e => setNewName(e.target.value)} required minLength={2} maxLength={100} className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /></label>
                <label className="mt-3 block text-sm font-medium">Login ID<input value={newLogin} onChange={e => setNewLogin(e.target.value)} required pattern="[a-zA-Z0-9._-]{3,80}" className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /></label>
                <label className="mt-3 block text-sm font-medium">Temporary password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={12} maxLength={200} className="mt-1 w-full rounded-md border bg-background px-3 py-2.5" /><span className="mt-1 block text-xs text-muted-foreground">कम-से-कम 12 अक्षर।</span></label>
                <button disabled={busy} className="mt-4 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Create account</button>
              </form>
              <div className="space-y-3">
                {members.map(member => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                  <div><p className="font-semibold">{member.displayName}</p><p className="text-sm text-muted-foreground">{member.loginId}</p><p className="mt-1 text-xs text-muted-foreground">{member.isActive ? 'Active' : 'Access disabled'} · Created {new Date(member.createdAt).toLocaleDateString('en-IN')}</p></div>
                  <button disabled={busy} onClick={() => void toggleMember(member)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">{member.isActive ? 'Disable access' : 'Enable access'}</button>
                </div>)}
                {members.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">अभी कोई अधिकृत सदस्य खाता नहीं बनाया गया है।</p>}
              </div>
            </div>}
          </section>
        )}
      </div>
      <DeveloperCredit />
    </main>
  )
}
