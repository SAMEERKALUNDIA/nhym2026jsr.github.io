import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, BadgeCheck, Banknote, ClipboardList, FileSpreadsheet, Plus, RefreshCw, Wallet, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'

type Expense = {
  id: string; expense_no: string; category_name: string; vendor_name: string; description: string
  requested_amount_paise: number; approved_amount_paise: number | null; expense_date: string
  approval_status: string; payment_status: string; paid_amount_paise: number
}
type FinanceUser = { id: string; displayName: string; loginId: string; role: 'FINANCE_HEAD' | 'OPERATOR' | 'APPROVER' | 'AUDITOR'; active?: boolean }
type FinanceAudit = Record<string, unknown>
type Dashboard = {
  totalIncomePaise: number; totalPaidPaise: number; pendingApprovalCount: number
  unpaidCount: number; categories: { id: string; name: string; category_type: string }[]
  expenses: Expense[]; incomes: Array<Record<string, unknown>>; budgets: Array<Record<string, unknown>>; documents: Array<Record<string, unknown>>
}
const money = (paise: number | null | undefined) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100)
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
const safeAuditJson = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null
  try { return JSON.parse(value) as unknown } catch { return value }
}

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Finance API returned an unexpected non-JSON response (HTTP ${response.status}). The server deployment or route still needs attention.`)
  }
}

export default function Finance() {
  const [token, setToken] = useState(() => sessionStorage.getItem('nhym_finance_session') || '')
  const [currentUser, setCurrentUser] = useState<FinanceUser | null>(() => { try { return JSON.parse(sessionStorage.getItem('nhym_finance_user') || 'null') as FinanceUser | null } catch { return null } })
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(() => sessionStorage.getItem('nhym_finance_must_change_password') === '1')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [bootstrapKey, setBootstrapKey] = useState('')
  const [bootstrapName, setBootstrapName] = useState('')
  const [bootstrapLoginId, setBootstrapLoginId] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [showBootstrap, setShowBootstrap] = useState(false)
  const [users, setUsers] = useState<FinanceUser[]>([])
  const [showUsers, setShowUsers] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserLogin, setNewUserLogin] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<FinanceUser['role']>('OPERATOR')
  const [data, setData] = useState<Dashboard | null>(null)
  const [auditLogs, setAuditLogs] = useState<FinanceAudit[]>([])
  const [showAuditLogs, setShowAuditLogs] = useState(false)
  const [auditFilter, setAuditFilter] = useState('ALL')
  const [auditBusy, setAuditBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetCategory, setBudgetCategory] = useState('exp-food')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriod, setBudgetPeriod] = useState('NHYM2026')
  const [incomeType, setIncomeType] = useState('Registration Collection')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [incomeAmount, setIncomeAmount] = useState('')
  const [receivedAt, setReceivedAt] = useState(today)
  const [incomeMode, setIncomeMode] = useState('UPI')
  const [incomeReference, setIncomeReference] = useState('')
  const [receiptNo, setReceiptNo] = useState('')
  const [incomeRemarks, setIncomeRemarks] = useState('')
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

  // A reset account must stay on the forced password-change screen without requesting dashboard data.
  useEffect(() => { if (token && !mustChangePassword) void load(token) }, [token, mustChangePassword, load])

  const totals = useMemo(() => {
    const paid = data?.totalPaidPaise || 0
    const income = data?.totalIncomePaise || 0
    return { paid, income, net: income - paid }
  }, [data])

  useEffect(() => {
    void fetch('/api/finance/setup-status').then(async response => {
      if (!response.ok) throw new Error('Finance setup status unavailable')
      const result = await response.json() as { setupComplete: boolean }
      setSetupComplete(result.setupComplete)
    }).catch(() => setError('Finance database setup is not available yet. The finance migration must be applied to a test database first.'))
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const response = await fetch('/api/finance/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password: loginPassword }) })
      const result = await response.json() as { error?: string; token?: string; user?: FinanceUser; mustChangePassword?: boolean }
      if (!response.ok || !result.token || !result.user) throw new Error(result.error || 'Login nahi ho saka.')
      sessionStorage.setItem('nhym_finance_session', result.token)
      sessionStorage.setItem('nhym_finance_user', JSON.stringify(result.user))
      sessionStorage.setItem('nhym_finance_must_change_password', result.mustChangePassword ? '1' : '0')
      setMustChangePassword(Boolean(result.mustChangePassword))
      setToken(result.token); setCurrentUser(result.user); setLoginPassword('')
      if (!result.mustChangePassword) await load(result.token)
    } catch (e) { setError(e instanceof Error ? e.message : 'Login nahi ho saka.') }
  }

  async function changeTemporaryPassword(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('')
    if (newPassword.length < 12) { setError('New password must be at least 12 characters.'); return }
    try {
      const response = await fetch('/api/finance/change-password', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || 'Password change failed.')
      sessionStorage.setItem('nhym_finance_must_change_password', '0')
      setMustChangePassword(false); setCurrentPassword(''); setNewPassword('')
      setNotice(result.message || 'Password changed successfully.')
      // The state change above triggers the guarded effect to load the dashboard once.
    } catch (e) { setError(e instanceof Error ? e.message : 'Password change failed.') }
  }

  async function bootstrap(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('')
    try {
      const response = await fetch('/api/finance/bootstrap', { method: 'POST', headers: { authorization: `Bearer ${bootstrapKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: bootstrapName, loginId: bootstrapLoginId, password: bootstrapPassword }) })
      const result = await readApiJson<{ error?: string; message?: string }>(response)
      if (!response.ok) throw new Error(result.error || 'Finance Head account create nahi hua.')
      setNotice(result.message || 'Finance Head account create ho gaya.')
      setSetupComplete(true); setShowBootstrap(false); setBootstrapKey(''); setBootstrapPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Finance Head account create nahi hua.') }
  }

  async function loadAuditLogs(filter = auditFilter) {
    if (!token) return
    setAuditBusy(true); setError('')
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (filter !== 'ALL') params.set('entityType', filter)
      const response = await fetch(`/api/finance/audit?${params.toString()}`, { headers: { authorization: `Bearer ${token}` } })
      const result = await response.json() as { error?: string; logs?: FinanceAudit[] }
      if (!response.ok) throw new Error(result.error || 'Audit history load nahi hui.')
      setAuditLogs(result.logs || [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Audit history load nahi hui.') }
    finally { setAuditBusy(false) }
  }

  async function loadUsers() {
    const response = await fetch('/api/finance/users', { headers: { authorization: `Bearer ${token}` } })
    const result = await response.json() as { error?: string; users?: Array<Record<string, unknown>> }
    if (!response.ok) throw new Error(result.error || 'Finance users load nahi hue.')
    setUsers((result.users || []).map(u => ({ id: String(u.id), displayName: String(u.display_name), loginId: String(u.login_id), role: String(u.role) as FinanceUser['role'], active: Boolean(u.is_active) })))
  }

  async function setFinanceUserActive(user: FinanceUser) {
    const active = !user.active
    if (!window.confirm(active ? `Activate account for ${user.displayName}?` : `Deactivate ${user.displayName} and revoke all their active sessions?`)) return
    try {
      const response = await fetch(`/api/finance/users/${user.id}/status`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ active }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Account status update nahi hua.')
      setNotice(active ? 'Finance account activated.' : 'Finance account deactivated; sessions revoked.')
      await loadUsers()
    } catch (e) { setError(e instanceof Error ? e.message : 'Account status update nahi hua.') }
  }

  async function createFinanceUser(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('')
    try {
      const response = await fetch('/api/finance/users', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: newUserName, loginId: newUserLogin, password: newUserPassword, role: newUserRole }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Finance user create nahi hua.')
      setNotice('Finance user create ho gaya. Password ko secure tareeke se us user ko share karein.')
      setNewUserName(''); setNewUserLogin(''); setNewUserPassword('')
      await loadUsers()
    } catch (e) { setError(e instanceof Error ? e.message : 'Finance user create nahi hua.') }
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

  async function submitBudget(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('')
    const amountPaise = Math.round(Number(budgetAmount) * 100)
    if (!budgetCategory || !budgetPeriod.trim() || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) { setError('Budget category, period aur valid amount bhariye.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/finance/budgets', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ categoryId: budgetCategory, amountPaise, budgetPeriod: budgetPeriod.trim() }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Budget save nahi hua.')
      setNotice('Budget draft save ho gaya. Approval ke baad hi approved budget maana jayega.')
      setBudgetAmount(''); setShowBudgetForm(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Budget save nahi hua.') }
    finally { setBusy(false) }
  }

  async function decideBudget(budget: Record<string, unknown>, decision: 'APPROVED' | 'CLOSED') {
    const promptText = decision === 'APPROVED' ? 'Is budget ko approve karein?' : 'Is approved budget ko close karein?'
    if (!window.confirm(promptText)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/finance/budgets/${String(budget.id)}/decision`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ decision }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Budget status update nahi hua.')
      setNotice(`Budget status: ${decision}`); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Budget status update nahi hua.') }
    finally { setBusy(false) }
  }

  async function submitIncome(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    const amountPaise = Math.round(Number(incomeAmount) * 100)
    if (!incomeType.trim() || !receivedFrom.trim() || !Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !receivedAt) {
      setError('Income type, received from, date aur valid amount bhariye.')
      return
    }
    if (incomeMode !== 'CASH' && !incomeReference.trim()) {
      setError('UPI/bank payment ke liye transaction reference zaroori hai.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/finance/income', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ incomeType: incomeType.trim(), receivedFrom: receivedFrom.trim(), amountPaise, receivedAt, paymentMode: incomeMode, referenceNo: incomeReference.trim(), receiptNo: receiptNo.trim(), remarks: incomeRemarks.trim() }),
      })
      const result = await response.json() as { error?: string; incomeNo?: string }
      if (!response.ok) throw new Error(result.error || 'Income record nahi hua.')
      setNotice(`Income ${result.incomeNo} successfully record hua.`)
      setReceivedFrom(''); setIncomeAmount(''); setIncomeReference(''); setReceiptNo(''); setIncomeRemarks(''); setShowIncomeForm(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Income record nahi hua.') }
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

  async function uploadDocument(file: File, target: { expenseId?: string; incomeId?: string; documentType: string }) {
    setError(''); setNotice('')
    if (file.size > 20 * 1024 * 1024) { setError('File 20 MB se chhoti ya barabar honi chahiye.'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('documentType', target.documentType)
      if (target.expenseId) form.append('expenseId', target.expenseId)
      if (target.incomeId) form.append('incomeId', target.incomeId)
      const response = await fetch('/api/finance/documents', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form })
      const result = await response.json() as { error?: string; fileName?: string }
      if (!response.ok) throw new Error(result.error || 'Document upload nahi hua.')
      setNotice(`Document upload hua: ${result.fileName || file.name}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Document upload nahi hua.') }
    finally { setBusy(false) }
  }

  async function downloadDocument(documentRecord: Record<string, unknown>) {
    setError('')
    try {
      const response = await fetch(`/api/finance/documents/${String(documentRecord.id)}`, { headers: { authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const result = await response.json() as { error?: string }
        throw new Error(result.error || 'Document download nahi hua.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = String(documentRecord.file_name || 'finance-document')
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Document download nahi hua.') }
  }

  function exportCsv() {
    if (!data) return
    const csvCell = (value: unknown) => {
      const raw = String(value ?? '')
      // Prevent spreadsheet formula execution when reports are opened in Excel/Sheets.
      const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw
      return `"${safe.replace(/"/g, '""')}"`
    }
    const sections: unknown[][] = [
      ['NHYM 2026 FINANCE REPORT'],
      ['Generated At', new Date().toLocaleString('en-IN')],
      ['SUMMARY'],
      ['Total Income (INR)', (totals.income / 100).toFixed(2)],
      ['Paid Expenses (INR)', (totals.paid / 100).toFixed(2)],
      ['Net Cash Movement (INR)', (totals.net / 100).toFixed(2)],
      [],
      ['EXPENSE REGISTER'],
      ['Expense ID','Category','Vendor','Description','Date','Requested INR','Approved INR','Paid INR','Approval Status','Payment Status'],
      ...data.expenses.map(x => [x.expense_no,x.category_name,x.vendor_name,x.description,x.expense_date,(x.requested_amount_paise/100).toFixed(2),x.approved_amount_paise == null ? '' : (x.approved_amount_paise/100).toFixed(2),(x.paid_amount_paise/100).toFixed(2),x.approval_status,x.payment_status]),
      [],
      ['INCOME REGISTER'],
      ['Income ID','Date','Type','Received From','Amount INR','Payment Mode','Receipt No.'],
      ...data.incomes.map(x => [x.income_no,x.received_at,x.income_type,x.received_from,(Number(x.amount_paise ?? 0)/100).toFixed(2),x.payment_mode,x.receipt_no]),
      [],
      ['BUDGET REGISTER'],
      ['Period','Category','Planned Amount INR','Status','Revision'],
      ...data.budgets.map(x => [x.budget_period,x.category_name,(Number(x.approved_amount_paise ?? 0)/100).toFixed(2),x.status,x.revision_no]),
    ]
    const csv = sections.map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'NHYM-2026-Finance-Report.csv'; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function exportPdf() {
    if (!data) return
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const left = 12
    const right = pageWidth - 12
    const contentWidth = right - left
    const green: [number, number, number] = [23, 75, 53]
    const paleGreen: [number, number, number] = [221, 239, 227]
    const muted: [number, number, number] = [82, 103, 90]
    const border: [number, number, number] = [183, 208, 191]
    const warangCitiHeaderImage = await (async () => {
      try {
        const response = await fetch('/NotoSansWarangCiti-Regular.ttf')
        if (!response.ok) return null
        const bytes = await response.arrayBuffer()
        const url = URL.createObjectURL(new Blob([bytes], { type: 'font/ttf' }))
        const face = new FontFace('NHYMWarangCitiFinance', `url(${url})`)
        await face.load()
        document.fonts.add(face)
        const canvas = document.createElement('canvas')
        canvas.width = 1800; canvas.height = 110
        const context = canvas.getContext('2d')
        if (!context) return null
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#1e412a'; context.textAlign = 'center'; context.textBaseline = 'middle'
        context.font = '64px NHYMWarangCitiFinance'
        context.fillText('𑢴𑢢𑢴𑢣𑢶 𑢹𑢩𑢩 𑢮𑢣𑢡𑢳 𑢮𑢣𑢶𑢣𑢼 : 𑢽𑢢𑢼𑢮𑢩𑢳', canvas.width / 2, canvas.height / 2)
        URL.revokeObjectURL(url)
        return canvas.toDataURL('image/png')
      } catch { return null }
    })()
    async function imageData(path: string): Promise<string | null> {
      try {
        const response = await fetch(path)
        if (!response.ok) return null
        const blob = await response.blob()
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      } catch { return null }
    }
    const hoSamajLogoData = await imageData('/ho-samaj-logo.jpg')
    const logoData = await imageData('/nhym-logo2.jpg')
    const formatDate = (value: unknown) => {
      const raw = String(value ?? '')
      if (!raw) return '—'
      const date = new Date(raw)
      return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('en-IN')
    }
    const moneyValue = (paise: unknown) => 'INR ' + (Number(paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    let pageNumber = 0
    let y = 0

    const drawHeader = () => {
      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, pageWidth, pageHeight, 'F')
      if (hoSamajLogoData) {
        const props = doc.getImageProperties(hoSamajLogoData)
        const scale = Math.min(20 / props.width, 20 / props.height)
        doc.addImage(hoSamajLogoData, 'JPEG', left + (20 - props.width * scale) / 2, 3 + (20 - props.height * scale) / 2, props.width * scale, props.height * scale)
      }
      if (logoData) {
        const props = doc.getImageProperties(logoData)
        const scale = Math.min(20 / props.width, 20 / props.height)
        doc.addImage(logoData, 'JPEG', right - 20 + (20 - props.width * scale) / 2, 3 + (20 - props.height * scale) / 2, props.width * scale, props.height * scale)
      }
      if (warangCitiHeaderImage) doc.addImage(warangCitiHeaderImage, 'PNG', pageWidth / 2 - 48, 1.5, 96, 5.8)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(...green)
      doc.text('NATIONAL HO YOUTH MEET : SIRJON', pageWidth / 2, 9.5, { align: 'center' })
      doc.setFontSize(9.5)
      doc.text('2026', pageWidth / 2, 13.5, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.8)
      doc.setTextColor(72, 30, 20)
      doc.text('Organized By : Adivasi Ho Samaj Yuva Mahasabha • Jamshedpur • 28–29 November 2026', pageWidth / 2, 18, { align: 'center', maxWidth: contentWidth - 44 })
      doc.setFillColor(...paleGreen)
      doc.setDrawColor(...green)
      doc.roundedRect(left, 25, contentWidth, 7, 1.2, 1.2, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(...green)
      doc.text('FINANCIAL STATEMENT', pageWidth / 2, 29.5, { align: 'center' })
      doc.setDrawColor(...border)
      doc.line(left, 34, right, 34)
      y = 39
    }
    const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })
    const drawFooter = () => {
      doc.setDrawColor(...border)
      doc.setLineWidth(0.35)
      doc.line(left, pageHeight - 13, right, pageHeight - 13)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...muted)
      doc.text('Adress: Adivasi Ho Samaj Bhawan,Golmuri, Jamshedpur-831003 | Email: nhym2026jsr@gmail.com | Phone: 9931333025,7870979751', pageWidth / 2, pageHeight - 9.5, { align: 'center', maxWidth: pageWidth - left * 2 })
      doc.text(`Generated: ${generatedAt} IST`, left, pageHeight - 4, { align: 'left' })
    }
    const newPage = () => {
      drawFooter()
      doc.addPage()
      pageNumber += 1
      y = 12
    }
    const ensureSpace = (height: number) => {
      if (y + height > pageHeight - 18) newPage()
    }
    const drawSection = (title: string) => {
      ensureSpace(11)
      y += 2
      // Keep register section labels clean: bold centered text with a strong underline,
      // without the dark-green/pale-green filled heading bar.
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...green)
      doc.text(title.toUpperCase(), pageWidth / 2, y, { align: 'center', maxWidth: contentWidth - 8 })
      const underlineY = y + 1.4
      doc.setDrawColor(...green)
      doc.setLineWidth(0.8)
      doc.line(left, underlineY, right, underlineY)
      y += 7
    }
    const drawTable = (headers: string[], rows: string[][], widths: number[], aligns: Array<'left' | 'right' | 'center'> = []) => {
      // Scale every table to the available landscape page width to prevent
      // long descriptions, payee names and IDs from colliding across columns.
      const baseWidth = widths.reduce((sum, width) => sum + width, 0)
      widths = widths.map(width => width * contentWidth / baseWidth)
      const baseRowHeight = 9
      const drawTableHeader = () => {
        ensureSpace(10)
        doc.setFillColor(...green)
        doc.rect(left, y, contentWidth, baseRowHeight, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        let x = left
        headers.forEach((header, i) => {
          const align = aligns[i] || 'left'
          const tx = align === 'right' ? x + widths[i] - 2 : align === 'center' ? x + widths[i] / 2 : x + 2
          doc.text(header, tx, y + 5.6, { align, maxWidth: widths[i] - 3 })
          x += widths[i]
        })
        y += baseRowHeight
      }
      drawTableHeader()
      rows.forEach((row, rowIndex) => {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        const wrapped = row.map((value, i) => i === 0 ? [String(value ?? '—')] : doc.splitTextToSize(String(value ?? '—').replace(/\s+/g, ' ').trim(), Math.max(8, widths[i] - 4)) as string[])
        const maxLines = Math.max(1, ...wrapped.map(lines => lines.length))
        const rowHeight = Math.max(baseRowHeight, maxLines * 3.6 + 3)
        if (y + rowHeight > pageHeight - 18) {
          newPage()
          drawTableHeader()
        }
        if (rowIndex % 2 === 0) {
          doc.setFillColor(247, 249, 247)
          doc.rect(left, y, contentWidth, rowHeight, 'F')
        }
        doc.setDrawColor(220, 227, 221)
        doc.setLineWidth(0.15)
        doc.line(left, y + rowHeight, right, y + rowHeight)
        doc.setTextColor(42, 49, 44)
        let x = left
        wrapped.forEach((lines, i) => {
          const align = aligns[i] || 'left'
          const tx = align === 'right' ? x + widths[i] - 2 : align === 'center' ? x + widths[i] / 2 : x + 2
          if (i === 0) {
            // Keep the record ID on one line; shrink only its font to fit its own column.
            const originalSize = 7
            let size = originalSize
            doc.setFontSize(size)
            while (size > 5 && doc.getTextWidth(lines[0]) > widths[i] - 4) {
              size -= 0.25
              doc.setFontSize(size)
            }
            doc.text(lines[0], tx, y + 5, { align: 'left', maxWidth: widths[i] - 4 })
            doc.setFontSize(originalSize)
          } else {
            doc.text(lines, tx, y + 4.5, { align, lineHeightFactor: 1.05, maxWidth: widths[i] - 3 })
          }
          x += widths[i]
        })
        y += rowHeight
      })
      y += 3
    }

    pageNumber = 1
    drawHeader()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...muted)
    doc.text('Reporting basis: records currently loaded in the Finance dashboard.', left, y)
    y += 7

    const summaryItems = [
      { label: 'TOTAL RECORDED INCOME', value: moneyValue(totals.income) },
      { label: 'TOTAL PAID EXPENSES', value: moneyValue(totals.paid) },
      { label: 'NET CASH MOVEMENT*', value: moneyValue(totals.net) },
      { label: 'PENDING APPROVALS', value: String(data.pendingApprovalCount ?? 0) },
    ]
    const gap = 4
    const cardWidth = (contentWidth - gap * 3) / 4
    summaryItems.forEach((item, index) => {
      const x = left + index * (cardWidth + gap)
      doc.setFillColor(...paleGreen)
      doc.setDrawColor(...green)
      doc.setLineWidth(0.4)
      doc.roundedRect(x, y, cardWidth, 17, 1.5, 1.5, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.7)
      doc.setTextColor(...muted)
      doc.text(item.label, x + 3, y + 5)
      doc.setFontSize(11)
      doc.setTextColor(...green)
      doc.text(item.value, x + 3, y + 12.5)
    })
    y += 21
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...muted)
    doc.text('* Net cash movement is recorded income minus paid expenses; it is not a verified bank/cash balance.', left, y)
    y += 5

    drawSection('Expense Register')
    drawTable(
      ['S. No.', 'Expense ID', 'Date', 'Category', 'Vendor / Payee', 'Purpose', 'Requested', 'Approved', 'Paid', 'Approval', 'Payment'],
      data.expenses.map((x, i) => [
        String(i + 1), x.expense_no, formatDate(x.expense_date), x.category_name, x.vendor_name, x.description,
        moneyValue(x.requested_amount_paise), x.approved_amount_paise == null ? '—' : moneyValue(x.approved_amount_paise),
        moneyValue(x.paid_amount_paise), x.approval_status, x.payment_status,
      ]),
      [9, 42, 19, 30, 37, 47, 22, 22, 20, 21, 21],
      ['center', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'center', 'center'],
    )

    drawSection('Income Register')
    drawTable(
      ['S. No.', 'Income ID', 'Received Date', 'Income Type', 'Received From', 'Amount', 'Mode', 'Reference / Receipt'],
      data.incomes.map((x, i) => [
        String(i + 1), String(x.income_no ?? ''), formatDate(x.received_at), String(x.income_type ?? ''),
        String(x.received_from ?? ''), moneyValue(x.amount_paise), String(x.payment_mode ?? ''),
        [String(x.reference_no ?? ''), String(x.receipt_no ?? '')].filter(Boolean).join(' / ') || '—',
      ]),
      [9, 40, 23, 28, 34, 25, 18, 24],
      ['center', 'left', 'left', 'left', 'left', 'right', 'center', 'left'],
    )

    drawSection('Budget Register')
    drawTable(
      ['S. No.', 'Budget Period', 'Category', 'Planned / Approved Amount', 'Status', 'Revision'],
      data.budgets.map((x, i) => [
        String(i + 1), String(x.budget_period ?? ''), String(x.category_name ?? ''),
        moneyValue(x.approved_amount_paise), String(x.status ?? ''), String(x.revision_no ?? ''),
      ]),
      [9, 38, 42, 48, 35, 23],
      ['center', 'left', 'left', 'right', 'center', 'center'],
    )

    const pageCount = doc.getNumberOfPages()
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page)
      // Draw the footer on every page, then replace its page label with "Page X of Y".
      pageNumber = page
      drawFooter()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...muted)
      doc.text(`Page ${page} of ${pageCount}`, right, pageHeight - 4, { align: 'right' })
    }
    doc.save('NHYM-2026-Finance-Accounting-Report.pdf')
  }

  if (!token) return <main className="min-h-screen bg-background px-4 py-12 text-foreground"><div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm">
    <Link to="/admin" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/> Admin dashboard</Link>
    <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Finance</p><h1 className="mt-2 text-3xl font-semibold">Finance Panel</h1>
    {setupComplete === false ? <><p className="mt-2 text-sm text-muted-foreground">First setup: existing website admin key se ek individual Finance Head account banaiye. Ye setup sirf tab chalega jab koi finance user pehle se nahi hai.</p>
      {!showBootstrap ? <button onClick={()=>setShowBootstrap(true)} className="mt-5 w-full rounded-lg border px-4 py-3 font-medium">Set Up Finance Head</button> :
      <form onSubmit={bootstrap} className="mt-5 space-y-3"><input value={bootstrapName} onChange={e=>setBootstrapName(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Finance Head full name" required minLength={2}/><input value={bootstrapLoginId} onChange={e=>setBootstrapLoginId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Login ID (letters/numbers/._-)" required minLength={3}/><input type="password" autoComplete="new-password" value={bootstrapPassword} onChange={e=>setBootstrapPassword(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Strong password (12+ characters)" required minLength={12}/><input type="password" autoComplete="current-password" value={bootstrapKey} onChange={e=>setBootstrapKey(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Preview Admin key (PREVIEW_ADMIN_TOKEN)" required/><button className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">Create Finance Head</button><button type="button" onClick={()=>setShowBootstrap(false)} className="w-full rounded-lg border px-4 py-3">Cancel</button></form>}
    </> : <><p className="mt-2 text-sm text-muted-foreground">Individual finance account se login karein. Sessions 12 hours mein expire ho jaate hain.</p><form onSubmit={login} className="mt-6 space-y-3"><input autoComplete="username" value={loginId} onChange={e=>setLoginId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Finance login ID" required/><input autoComplete="current-password" type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Password" required/><button className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">Secure Login</button></form></>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  </div></main>

  if (token && mustChangePassword) return <main className="min-h-screen bg-background px-4 py-12 text-foreground"><div className="mx-auto max-w-md rounded-2xl border bg-card p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Account Security</p><h1 className="mt-2 text-2xl font-semibold">Set a new password</h1><p className="mt-2 text-sm text-muted-foreground">For security, the temporary password must be replaced before you can use Finance Management. Choose a unique password with at least 12 characters.</p><form onSubmit={changeTemporaryPassword} className="mt-6 space-y-3"><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Temporary/current password" required/><input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-3" placeholder="New password (12+ characters)" required/><button disabled={busy} className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">{busy ? "Updating..." : "Change password and continue"}</button></form>{notice && <p role="status" className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<button onClick={()=>{sessionStorage.removeItem("nhym_finance_session");sessionStorage.removeItem("nhym_finance_user");sessionStorage.removeItem("nhym_finance_must_change_password");setToken("");setCurrentUser(null);setMustChangePassword(false)}} className="mt-4 w-full rounded-lg border px-4 py-3">Sign out</button></div></main>

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/> Admin dashboard</Link><p className="mt-4 text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Finance & Accounts</p><h1 className="mt-1 text-3xl font-semibold">Finance Management</h1><p className="mt-2 text-sm text-muted-foreground">Income, expenses, approvals and cash/bank records.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" disabled={busy}><RefreshCw size={16}/> Refresh</button><button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FileSpreadsheet size={16}/> Export CSV</button><button onClick={exportPdf} disabled={!data} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FileText size={16}/> Export PDF</button>{(currentUser?.role === "FINANCE_HEAD" || currentUser?.role === "OPERATOR") && <><button onClick={() => setShowBudgetForm(v => !v)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Plus size={16}/> Add Budget</button><button onClick={() => setShowIncomeForm(v => !v)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Plus size={16}/> Record Income</button><button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus size={16}/> Add Expense</button></>}{(currentUser?.role === "FINANCE_HEAD" || currentUser?.role === "AUDITOR") && <button onClick={() => {const next=!showAuditLogs;setShowAuditLogs(next);if(next)void loadAuditLogs()}} className="rounded-lg border px-3 py-2 text-sm">Audit History</button>}{currentUser?.role === "FINANCE_HEAD" && <button onClick={() => {setShowUsers(v=>!v);void loadUsers().catch(e=>setError(e instanceof Error?e.message:"Users load nahi hue."))}} className="rounded-lg border px-3 py-2 text-sm">Finance Users</button>}<button onClick={async () => {try {await fetch('/api/finance/logout',{method:'POST',headers:{authorization:'Bearer '+token}})} catch { /* Local logout must still complete if the network is unavailable. */ } finally {sessionStorage.removeItem('nhym_finance_session');sessionStorage.removeItem('nhym_finance_user');setToken('');setCurrentUser(null);setData(null)}}} className="rounded-lg border px-3 py-2 text-sm">Logout</button></div>
    </div>
    {showUsers && currentUser?.role === 'FINANCE_HEAD' && <section className="mt-6 rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Finance User Accounts</h2><p className="mt-1 text-sm text-muted-foreground">Each person should have an individual login. Minimum password length: 12 characters. Share credentials privately.</p><form onSubmit={createFinanceUser} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input value={newUserName} onChange={e=>setNewUserName(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Full name" required minLength={2}/><input value={newUserLogin} onChange={e=>setNewUserLogin(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Login ID" required minLength={3}/><input type="password" autoComplete="new-password" value={newUserPassword} onChange={e=>setNewUserPassword(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Temporary password (12+)" required minLength={12}/><select value={newUserRole} onChange={e=>setNewUserRole(e.target.value as FinanceUser['role'])} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="OPERATOR">Operator</option><option value="APPROVER">Approver</option><option value="AUDITOR">Auditor</option><option value="FINANCE_HEAD">Finance Head</option></select><button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Create Account</button></form><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr>{['Name','Login ID','Role','Status','Action'].map(x=><th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody>{users.map(u=><tr key={u.id} className="border-t"><td className="px-3 py-2">{u.displayName}</td><td className="px-3 py-2">{u.loginId}</td><td className="px-3 py-2">{u.role.replace('_',' ')}</td><td className="px-3 py-2">{u.active ? 'Active' : 'Inactive'}</td><td className="px-3 py-2"><button disabled={u.id===currentUser?.id} onClick={()=>void setFinanceUserActive(u)} className="rounded-md border px-2 py-1 text-xs">{u.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div></section>}
    {error && <p role="alert" className="mt-5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-lg bg-emerald-500/10 p-3 text-sm">{notice}</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{label:'Total Income',value:money(totals.income),icon:Wallet},{label:'Paid Expenses',value:money(totals.paid),icon:Banknote},{label:'Net Cash Movement*',value:money(totals.net),icon:ClipboardList},{label:'Pending Approval',value:String(data?.pendingApprovalCount ?? 0),icon:BadgeCheck}].map(item => <section key={item.label} className="rounded-xl border bg-card p-4"><item.icon className="text-muted-foreground" size={20}/><p className="mt-3 text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p></section>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">*Net cash movement is total recorded income minus paid expenses; it is not a verified bank/cash balance.</p>
    {showBudgetForm && <form onSubmit={submitBudget} className="mt-6 grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2"><div className="md:col-span-2"><h2 className="text-lg font-semibold">Create Category Budget</h2><p className="text-sm text-muted-foreground">Budget pehle Draft hoga; approve karne ke baad status Approved hoga.</p></div><label className="space-y-1 text-sm"><span>Expense Category</span><select value={budgetCategory} onChange={e=>setBudgetCategory(e.target.value)} className="w-full rounded-lg border bg-background p-3">{(data?.categories || []).filter(c=>c.category_type==='EXPENSE').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="space-y-1 text-sm"><span>Budget Period</span><input value={budgetPeriod} onChange={e=>setBudgetPeriod(e.target.value)} className="w-full rounded-lg border bg-background p-3" maxLength={40} required/></label><label className="space-y-1 text-sm"><span>Budget Amount (₹)</span><input type="number" min="0.01" step="0.01" value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)} className="w-full rounded-lg border bg-background p-3" required/></label><div className="flex gap-2 md:col-span-2"><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Save Draft Budget</button><button type="button" onClick={()=>setShowBudgetForm(false)} className="rounded-lg border px-4 py-2">Cancel</button></div></form>}
    {showIncomeForm && <form onSubmit={submitIncome} className="mt-6 grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
      <div className="md:col-span-2"><h2 className="text-lg font-semibold">Record Income / Receipt</h2><p className="text-sm text-muted-foreground">Registration collection, donation, sponsorship aur anya income ko alag record karein.</p></div>
      <label className="space-y-1 text-sm"><span>Income Type</span><select value={incomeType} onChange={e=>setIncomeType(e.target.value)} className="w-full rounded-lg border bg-background p-3">{['Registration Collection','Donation','Sponsorship','Committee Contribution','Other Income'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>Received Date</span><input type="date" value={receivedAt} onChange={e=>setReceivedAt(e.target.value)} className="w-full rounded-lg border bg-background p-3" required/></label>
      <label className="space-y-1 text-sm"><span>Received From</span><input value={receivedFrom} onChange={e=>setReceivedFrom(e.target.value)} className="w-full rounded-lg border bg-background p-3" maxLength={160} required/></label>
      <label className="space-y-1 text-sm"><span>Amount (₹)</span><input type="number" min="0.01" step="0.01" value={incomeAmount} onChange={e=>setIncomeAmount(e.target.value)} className="w-full rounded-lg border bg-background p-3" required/></label>
      <label className="space-y-1 text-sm"><span>Payment Mode</span><select value={incomeMode} onChange={e=>setIncomeMode(e.target.value)} className="w-full rounded-lg border bg-background p-3">{['UPI','BANK_TRANSFER','CASH'].map(x=><option key={x} value={x}>{x==='BANK_TRANSFER'?'Bank Transfer':x}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span>Transaction Reference {incomeMode!=='CASH'?'(required)':'(optional)'}</span><input value={incomeReference} onChange={e=>setIncomeReference(e.target.value)} className="w-full rounded-lg border bg-background p-3" maxLength={160} required={incomeMode!=='CASH'}/></label>
      <label className="space-y-1 text-sm"><span>Receipt Number (optional)</span><input value={receiptNo} onChange={e=>setReceiptNo(e.target.value)} className="w-full rounded-lg border bg-background p-3" maxLength={100}/></label>
      <label className="space-y-1 text-sm"><span>Remarks (optional)</span><input value={incomeRemarks} onChange={e=>setIncomeRemarks(e.target.value)} className="w-full rounded-lg border bg-background p-3" maxLength={500}/></label>
      <div className="flex flex-wrap gap-2 md:col-span-2"><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{busy?'Saving…':'Save Income'}</button><button type="button" onClick={()=>setShowIncomeForm(false)} className="rounded-lg border px-4 py-2">Cancel</button></div>
    </form>}
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
        {(data?.expenses || []).map(x=><tr key={x.id} className="border-t align-top"><td className="px-4 py-3 font-medium">{x.expense_no}</td><td className="px-4 py-3">{x.expense_date}<p className="text-xs text-muted-foreground">{x.category_name}</p></td><td className="max-w-[240px] px-4 py-3"><p className="font-medium">{x.vendor_name}</p><p className="mt-1 whitespace-normal text-xs text-muted-foreground">{x.description}</p></td><td className="px-4 py-3">{money(x.requested_amount_paise)}</td><td className="px-4 py-3">{x.approved_amount_paise == null?'—':money(x.approved_amount_paise)}</td><td className="px-4 py-3">{money(x.paid_amount_paise)}</td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{x.approval_status}</span><p className="mt-2 text-xs text-muted-foreground">{x.payment_status}</p></td><td className="px-4 py-3"><div className="flex flex-col gap-2">{(currentUser?.role==='FINANCE_HEAD' || currentUser?.role==='APPROVER') && x.approval_status==='PENDING' && <><button disabled={busy} onClick={()=>void decide(x,'APPROVED')} className="rounded-md border px-2 py-1 text-xs">Approve</button><button disabled={busy} onClick={()=>void decide(x,'REJECTED')} className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive">Reject</button></>}{(currentUser?.role==='FINANCE_HEAD' || currentUser?.role==='OPERATOR') && x.approval_status==='APPROVED' && x.payment_status!=='PAID' && <button disabled={busy} onClick={()=>void recordPayment(x)} className="rounded-md border px-2 py-1 text-xs">Record Payment</button>}{(currentUser?.role==="FINANCE_HEAD" || currentUser?.role==="OPERATOR") && <label className="cursor-pointer rounded-md border px-2 py-1 text-center text-xs">Attach Bill<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={e=>{const input=e.currentTarget;const file=input.files?.[0];input.value="";if(file)void uploadDocument(file,{expenseId:x.id,documentType:"BILL"})}} /></label>}</div></td></tr>)}
        {(!data || data.expenses.length===0) && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">{busy?'Loading finance records…':'No expenses recorded yet. Add your first expense request.'}</td></tr>}
      </tbody></table></div>
    </section>
    <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Budget Register</h2><p className="text-sm text-muted-foreground">Category-wise draft, approved and closed budgets</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{['Period','Category','Budget Amount','Status','Actions'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{(data?.budgets || []).map((b,i)=><tr key={String(b.id ?? i)} className="border-t"><td className="px-4 py-3">{String(b.budget_period ?? '')}</td><td className="px-4 py-3">{String(b.category_name ?? '')}</td><td className="px-4 py-3">{money(Number(b.approved_amount_paise ?? 0))}</td><td className="px-4 py-3">{String(b.status ?? '')}</td><td className="px-4 py-3"><div className="flex gap-2">{(currentUser?.role==='FINANCE_HEAD' || currentUser?.role==='APPROVER') && b.status==='DRAFT' && <button disabled={busy} onClick={()=>void decideBudget(b,'APPROVED')} className="rounded-md border px-2 py-1 text-xs">Approve</button>}{(currentUser?.role==='FINANCE_HEAD' || currentUser?.role==='APPROVER') && b.status==='APPROVED' && <button disabled={busy} onClick={()=>void decideBudget(b,'CLOSED')} className="rounded-md border px-2 py-1 text-xs">Close</button>}</div></td></tr>)}{(!data || data.budgets.length===0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No budgets created yet.</td></tr>}</tbody></table></div></section>
    <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Income Register</h2><p className="text-sm text-muted-foreground">Recent income receipts (up to 200 records)</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{['Income ID','Date','Type','Received From','Amount','Mode','Receipt No.'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{(data?.incomes || []).map((x,i)=><tr key={String(x.income_no ?? i)} className="border-t"><td className="px-4 py-3 font-medium">{String(x.income_no ?? '')}</td><td className="px-4 py-3">{String(x.received_at ?? '')}</td><td className="px-4 py-3">{String(x.income_type ?? '')}</td><td className="px-4 py-3">{String(x.received_from ?? '')}</td><td className="px-4 py-3">{money(Number(x.amount_paise ?? 0))}</td><td className="px-4 py-3">{String(x.payment_mode ?? '')}</td><td className="px-4 py-3">{String(x.receipt_no ?? '—')}</td></tr>)}{(!data || data.incomes.length===0) && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No income records yet.</td></tr>}</tbody></table></div></section>
    <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Bill & Receipt Documents</h2><p className="text-sm text-muted-foreground">Private documents stored in R2; downloads require authenticated finance access. PDF, JPG, PNG and WebP up to 20 MB.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{['Document','Related Record','Type','Size','Uploaded','Action'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{(data?.documents || []).map((d,i)=><tr key={String(d.id ?? i)} className="border-t"><td className="max-w-[240px] break-words px-4 py-3">{String(d.file_name ?? '')}</td><td className="px-4 py-3">{String(d.expense_no ?? d.income_no ?? '—')}</td><td className="px-4 py-3">{String(d.document_type ?? '')}</td><td className="px-4 py-3">{(Number(d.size_bytes ?? 0)/1024/1024).toFixed(2)} MB</td><td className="px-4 py-3">{String(d.uploaded_at ?? '')}</td><td className="px-4 py-3"><button disabled={busy} onClick={()=>void downloadDocument(d)} className="rounded-md border px-2 py-1 text-xs">Download</button></td></tr>)}{(!data || data.documents.length===0) && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No documents uploaded yet.</td></tr>}</tbody></table></div></section>
    {showAuditLogs && (currentUser?.role === 'FINANCE_HEAD' || currentUser?.role === 'AUDITOR') && <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Finance Audit History</h2><p className="text-sm text-muted-foreground">Latest 200 actions. Read-only view for accountability and review.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filter audit history by record type" value={auditFilter} onChange={e=>{setAuditFilter(e.target.value);void loadAuditLogs(e.target.value)}} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="ALL">All record types</option><option value="EXPENSE">Expenses</option><option value="PAYMENT">Payments</option><option value="INCOME">Income</option><option value="BUDGET">Budgets</option><option value="FINANCE_USER">User accounts</option><option value="DOCUMENT">Documents</option></select><button onClick={()=>void loadAuditLogs()} disabled={auditBusy} className="rounded-lg border px-3 py-2 text-sm">{auditBusy?'Loading…':'Refresh history'}</button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{['When','Actor','Record','Action','Reason / Details'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{auditLogs.map((log,i)=><tr key={String(log.id ?? i)} className="border-t align-top"><td className="whitespace-nowrap px-4 py-3">{String(log.created_at ?? '')}</td><td className="px-4 py-3">{String(log.actor_name ?? 'Former / unavailable user')}</td><td className="px-4 py-3"><span className="font-medium">{String(log.entity_type ?? '')}</span><p className="mt-1 max-w-[180px] break-all text-xs text-muted-foreground">{String(log.entity_id ?? '')}</p></td><td className="px-4 py-3">{String(log.action ?? '')}</td><td className="max-w-[360px] px-4 py-3"><p className="whitespace-normal">{String(log.reason ?? '—')}</p><details className="mt-2"><summary className="cursor-pointer text-xs text-primary">View change details</summary><pre className="mt-2 max-w-[340px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs">{JSON.stringify({before:safeAuditJson(log.old_values_json),after:safeAuditJson(log.new_values_json),requestId:log.request_id ?? null},null,2)}</pre></details></td></tr>)}{auditLogs.length===0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{auditBusy?'Loading audit history…':'No audit records for this filter yet. Use Refresh history to check again.'}</td></tr>}</tbody></table></div></section>}
    <p className="mt-4 text-xs text-muted-foreground">CSV and PDF reports include summary totals plus the currently loaded expense, income and budget registers. Records are limited to the dashboard API response (up to 500 expenses and 200 income/budget records); secure bill upload and individual finance-role authentication remain prerequisites for production use.</p>
  </div></main>
}