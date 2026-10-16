import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'

type FinanceUser = { id: string; displayName: string; loginId: string; role: 'FINANCE_HEAD' | 'OPERATOR' | 'APPROVER' | 'AUDITOR' }

export default function Login() {
  const navigate = useNavigate()
  const [role, setRole] = useState<'admin' | 'finance'>(() => new URLSearchParams(window.location.search).get('role') === 'finance' ? 'finance' : 'admin')
  const [adminKey, setAdminKey] = useState('')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (role === 'admin') {
        const cleanKey = adminKey.trim()
        const isDailyUpdatesPreview = window.location.hostname === 'nhymindia-daily-updates-preview.2026jsr.workers.dev'

        if (isDailyUpdatesPreview) {
          const response = await fetch('/api/admin/auth-check', {
            headers: { authorization: `Bearer ${cleanKey}` },
          })
          if (!response.ok) throw new Error('Preview Admin access key सही नहीं है।')
          sessionStorage.setItem('nhym_admin_token', cleanKey)
          navigate('/admin/updates', { replace: true })
          return
        }

        sessionStorage.setItem('nhym_admin_token', cleanKey)
        navigate('/admin', { replace: true })
        return
      }

      const response = await fetch('/api/finance/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      })
      const result = await response.json() as { error?: string; token?: string; user?: FinanceUser; mustChangePassword?: boolean }
      if (!response.ok || !result.token || !result.user) throw new Error(result.error || 'Finance login failed.')
      sessionStorage.setItem('nhym_finance_session', result.token)
      sessionStorage.setItem('nhym_finance_user', JSON.stringify(result.user))
      sessionStorage.setItem('nhym_finance_must_change_password', result.mustChangePassword ? '1' : '0')
      navigate('/admin/finance', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="min-h-screen bg-background px-4 py-12 text-foreground">
    <div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/> NHYM home</Link>
      <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><ShieldCheck size={24}/></div><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026</p><h1 className="mt-1 text-2xl font-semibold">Secure Login</h1></div></div>
      <p className="mt-3 text-sm text-muted-foreground">Choose your account type. Admin and Finance access use separate credentials and sessions.</p>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        <button type="button" onClick={() => {setRole('admin');setError('')}} className={`rounded-lg px-3 py-2 text-sm font-medium ${role === 'admin' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Main Admin</button>
        <button type="button" onClick={() => {setRole('finance');setError('')}} className={`rounded-lg px-3 py-2 text-sm font-medium ${role === 'finance' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Finance</button>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        {role === 'admin' ? <input type="password" autoComplete="current-password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Main Admin access key" required/> : <><input autoComplete="username" value={loginId} onChange={e=>setLoginId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Finance login ID" required/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Finance password" required/></>}
        <button disabled={busy} className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">{busy ? 'Signing in…' : 'Secure Login'}</button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <p className="mt-4 text-xs text-muted-foreground">Never share your access key or password. If a Finance password was reset by the Main Admin, you must replace the temporary password after signing in.</p>
      <div className="mt-5 border-t pt-4 text-sm"><Link to="/admin/finance" className="text-primary underline underline-offset-4">First-time Finance setup / legacy login</Link></div>
    </div>
  </main>
}
