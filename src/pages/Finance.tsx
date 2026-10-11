import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, BadgeCheck, Banknote, ClipboardList, Download, FileSpreadsheet, Plus, RefreshCw, Wallet } from 'lucide-react'

type Expense = {
  id: string; expense_no: string; category_name: string; vendor_name: string; description: string
  requested_amount_paise: number; approved_amount_paise: number | null; expense_date: string
  approval_status: string; payment_status: string; paid_amount_paise: number
}
type Dashboard = {
  totalIncomePaise: number; totalPaidPaise: number; pendingApprovalCount: number
  unpaidCount: number; categories: { id: string; name: string; category_type: string }[]
  expenses: Expense[]; incomes: Array<Record<string, unknown>>
}
const money = (paise: number | null | undefined) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100)
const today = new Date().toISOString().slice(0, 10)

export default function Finance() {
  const [token, setToken] = useState(() => sessionStorage.getItem('nhym_admin_token') || '')
  const [loginToken, setLoginToken] = useState('')
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('exp-food')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(today)

  const load = useCallback(async (auth = token) => {
    if (!auth) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/finance/dashboard', { headers: { authorization: `Bearer ${auth}` } })
      const result = await response.json() as Dashboard & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Finance data load nahi hua.')
      setData(result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Finance data load nahi hua.') }
    finally { setBusy(false) }
  }, [token])

  useEffect(() => { if (token) void load(token) }, [token, load])

  const totals = useMemo(() => {
    const paid = data?.totalPaidPaise || 0
    const income = data?.totalIncomePaise || 0
    return { paid, income, net: income - paid }
  }, [data])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const value = loginToken.trim()
    if (!value) return
    setError('')
    try {
      const response = await fetch('/api/finance/dashboard', { headers: { authorization: `Bearer ${value}` } })
      const result = await response.json() as Dashboard & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Admin access key sahi nahi hai.')
      sessionStorage.setItem('nhym_admin_token', value)
      setToken(value); setData(result); setLoginToken('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Login nahi ho saka.') }
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    const paise = Math.round(Number(amount) * 100)
    if (!vendor.trim() || !description.trim() || !Number.isFinite(paise) || paise <= 0) {
      setError('Vendor, description aur valid amount bhariye.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ categoryId, vendorName: vendor.trim(), description: description.trim(), amountPaise: paise, expenseDate }),
      })
      const result = await response.json() as { error?: string; expenseNo?: string }
      if (!response.ok) throw new Error(result.error || 'Expense save nahi hua.')
      setNotice(`Expense ${result.expenseNo} approval ke liye submit ho gaya.`)
      setVendor(''); setDescription(''); setAmount(''); setShowForm(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Expense save nahi hua.') }
    finally { setBusy(false) }
  }

  async function decide(expense: Expense, decision: 'APPROVED' | 'REJECTED') {
    const note = window.prompt(decision === 'APPROVED' ? 'Approval note (optional):' : 'Rejection reason (required):', '')
    if (note === null) return
    if (decision === 'REJECTED' && !note.trim()) { setError('Reject karne ka reason zaroori hai.'); return }
    const approvedAmount = decision === 'APPROVED' ? Number(window.prompt('Approved amount (₹):', (expense.requested_amount_paise / 100).toString())) : 0
    if (decision === 'APPROVED' && (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || approvedAmount * 100 > expense.requested_amount_paise)) {
      setError('Approved amount requested amount se zyada ya invalid nahi ho sakta.'); return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/finance/expenses/${expense.id}/decision`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ decision, remarks: note.trim(), approvedAmountPaise: Math.round(approvedAmount * 100) }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Approval update nahi hua.')
      setNotice(`Expense ${expense.expense_no}: ${decision}.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Approval update nahi hua.') }
    finally { setBusy(false) }
  }

  async function recordPayment(expense: Expense) {
    const amountText = window.prompt(`Payment amount in ₹ (remaining approved: ₹${((Number(expense.approved_amount_paise || 0) - Number(expense.paid_amount_paise || 0)) / 100).toFixed(2)}):`, ((Number(expense.approved_amount_paise || 0) - Number(expense.paid_amount_paise || 0)) / 100).toFixed(2))
    if (amountText === null) return
    const amountPaise = Math.round(Number(amountText) * 100)
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) { setError('Valid payment amount bhariye.'); return }
    const mode = window.prompt('Payment mode type karein: UPI, BANK_TRANSFER, ya CASH', 'UPI')
    if (mode === null) return
    const paymentMode = mode.trim().toUpperCase()
    if (!['UPI','BANK_TRANSFER','CASH'].includes(paymentMode)) { setError('Payment mode UPI, BANK_TRANSFER ya CASH hona chahiye.'); return }
    const referenceNo = paymentMode === 'CASH' ? '' : (window.prompt('UPI/bank transaction reference number:', '') || '').trim()
    if (paymentMode !== 'CASH' && !referenceNo) { setError('UPI/bank reference number required hai.'); return }
    const remarks = window.prompt('Payment note (optional):', '') || ''
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/finance/expenses/${expense.id}/payments`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ amountPaise, paymentMode, paidAt: today, referenceNo, remarks }),
      })
      const result = await response.json() as { error?: string; paymentNo?: string; paymentStatus?: string }
      if (!response.ok) throw new Error(result.error || 'Payment record nahi hua.')
      setNotice(`Payment ${result.paymentNo} record hua. Status: ${result.paymentStatus}.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Payment record nahi hua.') }
    finally { setBusy(false) }
  }

  function exportCsv() {
    if (!data) return
    const rows = [['Expense ID','Category','Vendor','Description','Date','Requested INR','Approved INR','Paid INR','Approval Status','Payment Status'],
      ...data.expenses.map(x => [x.expense_no,x.category_name,x.vendor_name,x.description,x.expense_date,(x.requested_amount_paise/100).toFixed(2),x.approved_amount_paise == null ? '' : (x.approved_amount_paise/100).toFixed(2),(x.paid_amount_paise/100).toFixed(2),x.approval_status,x.payment_status])]
    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'NHYM-2026-Finance-Expenses.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!token) return <main className="min-h-screen bg-background px-4 py-12 text-foreground"><div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
    <Link to="/admin" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/> Admin dashboard</Link>
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Finance</p><h1 className="mt-2 text-3xl font-semibold">Finance Panel</h1>
    <p className="mt-2 text-sm text-muted-foreground">Finance records ko access karne ke liye existing admin access key se login karein.</p>
    <form onSubmit={login} className="mt-6 space-y-3"><input autoComplete="current-password" type="password" value={loginToken} onChange={e => setLoginToken(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Admin access key" required/><button className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">Secure Login</button></form>
    {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  </div></main>

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/> Admin dashboard</Link><p className="mt-4 text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Finance & Accounts</p><h1 className="mt-1 text-3xl font-semibold">Finance Management</h1><p className="mt-2 text-sm text-muted-foreground">Income, expenses, approvals and cash/bank records.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" disabled={busy}><RefreshCw size={16}/> Refresh</button><button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FileSpreadsheet size={16}/> Export CSV</button><button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus size={16}/> Add Expense</button><button onClick={() => {sessionStorage.removeItem('nhym_admin_token');setToken('');setData(null)}} className="rounded-lg border px-3 py-2 text-sm">Logout</button></div>
    </div>
    {error && <p role="alert" className="mt-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-lg bg-emerald-500/10 p-3 text-sm">{notice}</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{label:'Total Income',value:money(totals.income),icon:Wallet},{label:'Paid Expenses',value:money(totals.paid),icon:Banknote},{label:'Net Cash Movement*',value:money(totals.net),icon:ClipboardList},{label:'Pending Approval',value:String(data?.pendingApprovalCount ?? 0),icon:BadgeCheck}].map(item => <section key={item.label} className="rounded-xl border bg-card p-4"><item.icon className="text-muted-foreground" size={20}/><p className="mt-3 text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p></section>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">*Net cash movement is total recorded income minus paid expenses; it is not a verified bank/cash balance.</p>
    {showForm && <form onSubmit={submitExpense} className="mt-6 grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="text-lg font-semibold">New Expense Request</h2><p className="text-sm text-muted-foreground">Approval ke baad hi payment record kiya ja sakega.</p></div>
      <label className="space-y-1 text-sm"><span>Expense Category</span><select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="w-full rounded-lg border bg-background p-3">{(data?.categories || []).filter(c=>c.category_type==='EXPENSE').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>Expense Date</span><input type="date" value={expenseDate} onChange={e=>setExpenseDate(e.target.value)} className="w-full rounded-lg border bg-background p-3" required/></label>
      <label className="space-y-1 text-sm"><span>Vendor / Paid To</span><input value={vendor} onChange={e=>setVendor(e.target.value)} className="w-full rounded-lg border bg-background p-3" required maxLength={160}/></label>
      <label className="space-y-1 text-sm"><span>Requested Amount (₹)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full rounded-lg border bg-background p-3" required/></label>
      <label className="space-y-1 text-sm md:col-span-2"><span>Description / Purpose</span><textarea value={description} onChange={e=>setDescription(e.target.value)} className="w-full rounded-lg border bg-background p-3" rows={3} required maxLength={1000}/></label>
      <div className="flex flex-wrap gap-2 md:col-span-2"><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{busy?'Saving…':'Submit for Approval'}</button><button type="button" onClick={()=>setShowForm(false)} className="rounded-lg border px-4 py-2">Cancel</button></div>
    </form>}
    <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Expense Register</h2><p className="text-sm text-muted-foreground">Recent expenses, approval and payment status</p></div><span className="text-sm text-muted-foreground">{data?.expenses.length ?? 0} records</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{['Expense ID','Date / Category','Vendor & Purpose','Requested','Approved','Paid','Status','Actions'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody>
        {(data?.expenses || []).map(x=><tr key={x.id} className="border-t align-top"><td className="px-4 py-3 font-medium">{x.expense_no}</td><td className="px-4 py-3">{x.expense_date}<p className="text-xs text-muted-foreground">{x.category_name}</p></td><td className="max-w-[240px] px-4 py-3"><p className="font-medium">{x.vendor_name}</p><p className="mt-1 whitespace-normal text-xs text-muted-foreground">{x.description}</p></td><td className="px-4 py-3">{money(x.requested_amount_paise)}</td><td className="px-4 py-3">{x.approved_amount_paise == null?'—':money(x.approved_amount_paise)}</td><td className="px-4 py-3">{money(x.paid_amount_paise)}</td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{x.approval_status}</span><p className="mt-2 text-xs text-muted-foreground">{x.payment_status}</p></td><td className="px-4 py-3"><div className="flex flex-col gap-2">{x.approval_status==='PENDING' && <><button disabled={busy} onClick={()=>void decide(x,'APPROVED')} className="rounded-md border px-2 py-1 text-xs">Approve</button><button disabled={busy} onClick={()=>void decide(x,'REJECTED')} className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive">Reject</button></>}{x.approval_status==='APPROVED' && x.payment_status!=='PAID' && <button disabled={busy} onClick={()=>void recordPayment(x)} className="rounded-md border px-2 py-1 text-xs">Record Payment</button>}</div></td></tr>)}
        {(!data || data.expenses.length===0) && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">{busy?'Loading finance records…':'No expenses recorded yet. Add your first expense request.'}</td></tr>}
      </tbody></table></div>
    </section>
    <p className="mt-4 text-xs text-muted-foreground">Initial implementation: expense requests, approval decisions, payment recording and CSV export. Income entry, secure bill upload, individual role accounts and PDF reports remain to be completed before production use.</p>
  </div></main>
}
