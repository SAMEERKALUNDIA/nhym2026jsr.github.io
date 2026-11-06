import { DeveloperCredit } from '@/components/DeveloperCredit'
import { useEffect, useMemo, useState } from 'react'
import { printSearchableHindiPdf } from '@/lib/printSearchableHindiPdf'

function categoryLabel(category: string) {
  switch (category) {
    case 'student': return 'Student Participant'
    case 'non-earning':
    case 'non_earning': return 'Non-Earning Participant'
    case 'earning': return 'Earning Participant'
    case 'visitor': return 'Audience / Visitor'
    default: return category || '—'
  }
}

function yesNo(value: string) {
  switch (value?.toLowerCase()) {
    case 'yes': return 'Yes'
    case 'no': return 'No'
    case 'maybe': return 'Maybe'
    default: return value || '—'
  }
}

async function readAdminApiJson<T>(response: Response, context: string): Promise<T> {
  const responseText = await response.text()
  try {
    return JSON.parse(responseText) as T
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown'
    console.error('Admin API returned a non-JSON response', {
      context,
      status: response.status,
      contentType,
      path: new URL(response.url).pathname,
    })
    throw new Error(
      contentType.includes('text/html')
        ? `Server ne ${context} API ke JSON ke badle HTML page bheja. Page refresh karke dobara koshish karein.`
        : `${context} API ka response JSON format mein nahi hai (HTTP ${response.status}).`
    )
  }
}


import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
const GALLERY_CATEGORIES = [
  'NHYM Events',
  'Ho Cultural Dance',
  'Meetings & Programmes',
  'Posters',
  'News',
  'Office Bearers',
] as const

type GalleryPhoto = {
  id: number
  r2Key: string
  title: string
  caption: string | null
  category: string
  contentType: string
  fileSize: number | null
  isPublished: boolean
  displayOrder: number
  createdAt: string
  updatedAt: string | null
  imageUrl: string
}
type Participant = {
  id: number
  participant_no: number
  name: string
  dob: string
  gender: string
  address: string
  district: string
  state: string
  pin: string
  age: string
  category: string
  fee: number
  activities_json: string
  cultural: string
  sports: string
  from_outside: string
  accommodation: string
  details_json: string
}

type PaymentRecord = {
  id: number | null
  payment_no: number
  payment_mode: string
  payment_reference: string
  amount: number
  status: string
  legacy?: boolean
  allocations?: Array<{ participant_id: number; name: string; category: string; fee: number; amount: number }>
}
type Row = {
  id: number
  registration_id: string
  email: string
  total_amount: number
  payment_mode: string
  payment_reference: string
  status: string
  participant_count: number
  created_at: string
  updated_at?: string
  approval_email_sent_at?: string | null
  participants?: Participant[]
  payments?: PaymentRecord[]
}

export default function Admin() {
  const adminPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const isGalleryPage = adminPath === '/admin/gallery'
  const isParticipantPage = adminPath === '/admin/participants'
  const isFeedbackPage = adminPath === '/admin/feedback'
  const isHomeSectionsPage = adminPath === '/admin/homepage-sections'

  const [token, setToken] = useState(
    () => sessionStorage.getItem('nhym_admin_token') || ''
  )
const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([])
const [galleryLoading, setGalleryLoading] = useState(false)
const [galleryUploading, setGalleryUploading] = useState(false)
const [selectedGalleryIds, setSelectedGalleryIds] = useState<number[]>([])
const [galleryDeleting, setGalleryDeleting] = useState(false)
const [galleryError, setGalleryError] = useState('')
const [galleryFiles, setGalleryFiles] = useState<File[]>([])
const [galleryCaption, setGalleryCaption] = useState('')
const [galleryCategory, setGalleryCategory] = useState('NHYM Events')
const [galleryEditingId, setGalleryEditingId] = useState<number | null>(null)
const [galleryEditTitle, setGalleryEditTitle] = useState('')
const [galleryEditCaption, setGalleryEditCaption] = useState('')
const [galleryEditCategory, setGalleryEditCategory] = useState('NHYM Events')
const [gallerySavingId, setGallerySavingId] = useState<number | null>(null)
const [galleryStorageUsed, setGalleryStorageUsed] = useState(0)
const galleryStorageMax = 10 * 1024 * 1024 * 1024
const gallerySelectedBytes = galleryFiles.reduce(
  (total, file) => total + file.size,
  0
)

const galleryStorageAfterSelection =
  galleryStorageUsed + gallerySelectedBytes

const galleryStorageExceeded =
  galleryStorageAfterSelection > galleryStorageMax
const [, setLoading] = useState(false)
const [authenticated, setAuthenticated] = useState(false)
const [checkingSession, setCheckingSession] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [feedbackItems, setFeedbackItems] = useState<Array<{id:string;name:string;city:string;category:string;message:string;createdAt:string}>>([])
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<string[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [homeSections, setHomeSections] = useState({ importantNotice: true, publicFeedback: true })
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [registrationControlLoading, setRegistrationControlLoading] = useState(false)
  const [registrationControlSaving, setRegistrationControlSaving] = useState(false)
  const [registrationControlTarget, setRegistrationControlTarget] = useState<boolean | null>(null)
  const [homeSectionsLoading, setHomeSectionsLoading] = useState(false)
  const [homeSectionsSaving, setHomeSectionsSaving] = useState(false)
  const [feedbackDeleting, setFeedbackDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<'PAYMENT_VERIFIED' | 'APPROVED' | 'REJECTED' | null>(null)
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState<'VERIFIED' | 'REJECTED' | 'PENDING' | null>(null)
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '')
  const [selected, setSelected] = useState<Row | null>(null)
  const [editingParticipantId, setEditingParticipantId] = useState<number | null>(null)
  const [participantDraft, setParticipantDraft] = useState({ name: '', dob: '', gender: '', address: '', district: '', state: '', pin: '', reason: '', privacyRequestId: '' })
  const [participantSaving, setParticipantSaving] = useState(false)
  const [participantAudit, setParticipantAudit] = useState<Array<{action:string;old_values_json:string;new_values_json:string;reason:string;privacy_request_id:string|null;actor:string;created_at:string}>>([])
  const [participantAuditId, setParticipantAuditId] = useState<number | null>(null)
  const [participantAuditLoading, setParticipantAuditLoading] = useState(false)
  const [adminFinanceUsers, setAdminFinanceUsers] = useState<Array<{id:string;display_name:string;login_id:string;role:string;is_active:number;last_login_at:string|null}>>([])
  const [showAdminFinanceUsers, setShowAdminFinanceUsers] = useState(false)
  const [adminFinanceLoading, setAdminFinanceLoading] = useState(false)
  const [adminFinanceError, setAdminFinanceError] = useState('')
  const [adminFinanceNotice, setAdminFinanceNotice] = useState('')
  const [resetFinanceUserId, setResetFinanceUserId] = useState('')
  const [resetFinancePassword, setResetFinancePassword] = useState('')

  async function loadRegistrationStatus() {
    setRegistrationControlLoading(true)
    setError('')
    try {
      const response = await fetch('/api/registration-status', { cache: 'no-store' })
      const data = await response.json() as { open?: boolean; error?: string }
      if (!response.ok || typeof data.open !== 'boolean') throw new Error(data.error || 'Registration status लोड नहीं हो सका।')
      setRegistrationOpen(data.open)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration status लोड नहीं हो सका।')
    } finally { setRegistrationControlLoading(false) }
  }

  async function saveRegistrationStatus(nextOpen: boolean) {
    setRegistrationControlTarget(nextOpen)
    setRegistrationControlSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/admin/registration-status', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ open: nextOpen }),
      })
      const data = await response.json() as { open?: boolean; error?: string }
      if (!response.ok || typeof data.open !== 'boolean') throw new Error(data.error || 'Registration status सेव नहीं हो सका।')
      setRegistrationOpen(data.open)
      setSuccess(data.open
        ? 'Registration दोबारा चालू कर दिया गया है। अब नए प्रतिभागी फॉर्म भर सकते हैं।'
        : 'Registration बंद कर दिया गया है। पुराने रिकॉर्ड और approval प्रक्रिया सुरक्षित हैं।')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration status सेव नहीं हो सका।')
    } finally { setRegistrationControlSaving(false); setRegistrationControlTarget(null) }
  }

  async function loadHomepageSections() {
    setHomeSectionsLoading(true)
    setError('')
    try {
      const response = await fetch('/api/homepage-sections', { cache: 'no-store' })
      const data = await response.json() as { importantNotice?: boolean; publicFeedback?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || 'Homepage settings लोड नहीं हो सकीं।')
      setHomeSections({ importantNotice: data.importantNotice !== false, publicFeedback: data.publicFeedback !== false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Homepage settings लोड नहीं हो सकीं।')
    } finally { setHomeSectionsLoading(false) }
  }

  async function saveHomepageSections() {
    setHomeSectionsSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/admin/homepage-sections', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(homeSections),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Homepage settings सेव नहीं हो सकीं।')
      setSuccess('Homepage section settings सफलतापूर्वक सेव हो गई हैं।')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Homepage settings सेव नहीं हो सकीं।')
    } finally { setHomeSectionsSaving(false) }
  }

  async function loadAdminFeedback() {
    setFeedbackLoading(true); setError('')
    try {
      const response = await fetch('/api/public-feedback', { cache: 'no-store' })
      const data = await response.json() as { feedback?: Array<{id:string;name:string;city:string;category:string;message:string;createdAt:string}>; error?: string }
      if (!response.ok) throw new Error(data.error || 'प्रतिक्रियाएँ लोड नहीं हो सकीं।')
      setFeedbackItems(Array.isArray(data.feedback) ? data.feedback : [])
      setSelectedFeedbackIds([])
    } catch (e) { setError(e instanceof Error ? e.message : 'प्रतिक्रियाएँ लोड नहीं हो सकीं।') }
    finally { setFeedbackLoading(false) }
  }

  async function deleteSelectedFeedback() {
    if (!selectedFeedbackIds.length) return
    if (!window.confirm(`क्या आप ${selectedFeedbackIds.length} चुनी गई प्रतिक्रिया(ओं) को स्थायी रूप से हटाना चाहते हैं?`)) return
    setFeedbackDeleting(true); setError(''); setSuccess('')
    try {
      for (const id of selectedFeedbackIds) {
        const response = await fetch(`/api/public-feedback/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
        const data = await response.json() as { error?: string }
        if (!response.ok) throw new Error(data.error || 'एक या अधिक प्रतिक्रियाएँ हटाई नहीं जा सकीं।')
      }
      setFeedbackItems(current => current.filter(item => !selectedFeedbackIds.includes(item.id)))
      setSelectedFeedbackIds([])
      setSuccess('चुनी गई प्रतिक्रिया(एँ) सफलतापूर्वक हटा दी गई हैं।')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'प्रतिक्रियाएँ हटाई नहीं जा सकीं।')
      await loadAdminFeedback()
    } finally { setFeedbackDeleting(false) }
  }

  async function load(authToken = token) {
  if (!authToken) return false

  setLoading(true)
  setError('')

  try {
    const r = await fetch('/api/admin/registrations', {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    })

    const j = await readAdminApiJson<{
      registrations?: Row[]
      error?: string
    }>(r, 'Registration list')

    if (!r.ok) {
      throw new Error(
        r.status === 401
          ? 'Invalid admin password / access key.'
          : j.error || 'Could not load registrations.'
      )
    }

    setRows(j.registrations || [])

    setSelected(current => {
      if (!current) return null

      return (
        (j.registrations || []).find(
          row => row.id === current.id
        ) || null
      )
    })

    return true
  } catch (e) {
    setError(
      e instanceof Error
        ? e.message
        : 'Could not load registrations.'
    )

    return false
  } finally {
    setLoading(false)
  }
}

async function loadAdminFinanceUsers() {
  setAdminFinanceLoading(true)
  setAdminFinanceError('')
  setAdminFinanceNotice('')
  try {
    const response = await fetch('/api/admin/finance-users', {
      headers: { authorization: `Bearer ${token}` },
    })
    const result = await response.json() as { users?: typeof adminFinanceUsers; error?: string }
    if (!response.ok) throw new Error(result.error || 'Could not load Finance accounts.')
    setAdminFinanceUsers(result.users || [])
    setShowAdminFinanceUsers(true)
  } catch (e) {
    setAdminFinanceError(e instanceof Error ? e.message : 'Could not load Finance accounts.')
  } finally {
    setAdminFinanceLoading(false)
  }
}

async function resetAdminFinancePassword(userId: string) {
  if (!resetFinancePassword || resetFinancePassword.length < 12) {
    setAdminFinanceError('Temporary password must be at least 12 characters.')
    return
  }
  if (!window.confirm('Reset this Finance account password? All existing sessions for this account will be signed out.')) return
  setAdminFinanceLoading(true)
  setAdminFinanceError('')
  setAdminFinanceNotice('')
  try {
    const response = await fetch(`/api/admin/finance-users/${userId}/reset-password`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: resetFinancePassword }),
    })
    const result = await response.json() as { message?: string; error?: string }
    if (!response.ok) throw new Error(result.error || 'Password reset failed.')
    setAdminFinanceNotice(result.message || 'Finance password reset successfully.')
    setResetFinancePassword('')
    setResetFinanceUserId('')
  } catch (e) {
    setAdminFinanceError(e instanceof Error ? e.message : 'Password reset failed.')
  } finally {
    setAdminFinanceLoading(false)
  }
}

function logout() {
  sessionStorage.removeItem('nhym_admin_token')

  setToken('')
  setAuthenticated(false)
  setRows([])
  setSelected(null)
  setSearch('')
  setError('')
  setSuccess('')
}
const loadGalleryPhotos = async () => {
  if (!token) return

  setGalleryLoading(true)
  setGalleryError('')

  try {
    const response = await fetch('/api/admin/gallery', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load gallery photos')
    }

    setGalleryPhotos(Array.isArray(data.photos) ? data.photos : [])
  } catch (error) {
    setGalleryError(
      error instanceof Error ? error.message : 'Unable to load gallery photos'
    )
  } finally {
    setGalleryLoading(false)
  }
}
const saveGalleryDetails = async (photoId: number) => {
  if (!token) {
    setGalleryError('Admin session is not available')
    return
  }

  if (!galleryEditTitle.trim()) {
    setGalleryError('Please enter an image name')
    return
  }

  setGallerySavingId(photoId)
  setGalleryError('')
  setSuccess('')

  try {
    const response = await fetch(`/api/admin/gallery/${photoId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: galleryEditTitle.trim(),
        caption: galleryEditCaption.trim(),
        category: galleryEditCategory.trim() || 'NHYM Events',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Could not update photo details')
    }

    await loadGalleryPhotos()
    setGalleryEditingId(null)
    setSuccess('Photo details updated successfully.')
  } catch (error) {
    setGalleryError(
      error instanceof Error
        ? error.message
        : 'Could not update photo details'
    )
  } finally {
    setGallerySavingId(null)
  }
}

const loadGalleryStorage = async () => {
  if (!token) return

  try {
    const response = await fetch('/api/admin/gallery/storage', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to load gallery storage')
    }

    const data = await response.json()
    setGalleryStorageUsed(Number(data.usedBytes ?? 0))
  } catch (error) {
    console.error('Failed to load gallery storage:', error)
  }
}
const uploadGalleryPhotos = async () => {
  if (!token) {
    setGalleryError('Admin session is not available')
    return
  }

  if (galleryFiles.length === 0) {
    setGalleryError('Please select at least one image')
    return
  }

  const maxSize = 20 * 1024 * 1024
  const invalidFile = galleryFiles.find(
    (file) =>
      file.size > maxSize ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )

  if (invalidFile) {
    setGalleryError(
      `${invalidFile.name} must be JPG, PNG or WebP and 20 MB or smaller`
    )
    return
  }

  setGalleryUploading(true)
  setGalleryError('')
  setSuccess('')

  let uploadedCount = 0
  const failedFiles: string[] = []

  try {
    for (const file of galleryFiles) {
      const formData = new FormData()

      const title = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      formData.append('image', file)
      formData.append('title', title || 'NHYM Photo')
      formData.append('caption', galleryCaption.trim())
      formData.append(
        'category',
        galleryCategory.trim() || 'NHYM Events'
      )

      try {
        const response = await fetch('/api/admin/gallery', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Upload failed')
        }

        uploadedCount++
      } catch {
        failedFiles.push(file.name)
      }
    }

    setGalleryFiles([])
    setGalleryCaption('')
    setGalleryCategory('NHYM Events')

    await loadGalleryPhotos()

    if (failedFiles.length === 0) {
      setSuccess(
        `${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} uploaded successfully.`
      )
    } else {
      setSuccess(
        `${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} uploaded successfully.`
      )
      setGalleryError(
        `Could not upload: ${failedFiles.join(', ')}`
      )
    }
  } finally {
    setGalleryUploading(false)
  }
}

const deleteSelectedGalleryPhotos = async () => {
  if (!token) {
    setGalleryError('Admin session is not available')
    return
  }

  if (selectedGalleryIds.length === 0) {
    setGalleryError('Please select at least one photo')
    return
  }

  const confirmed = window.confirm(
    `Delete ${selectedGalleryIds.length} selected photo${
      selectedGalleryIds.length === 1 ? '' : 's'
    }?\n\nThis action cannot be undone.`
  )

  if (!confirmed) return

  setGalleryDeleting(true)
  setGalleryError('')
  setSuccess('')

  try {
    for (const id of selectedGalleryIds) {
      const response = await fetch(`/api/admin/gallery/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete photo')
      }
    }

    setSelectedGalleryIds([])
    await loadGalleryPhotos()

    setSuccess(
      `${selectedGalleryIds.length} photo${
        selectedGalleryIds.length === 1 ? '' : 's'
      } deleted successfully.`
    )
  } catch (error) {
    setGalleryError(
      error instanceof Error
        ? error.message
        : 'Unable to delete selected photos'
    )
  } finally {
    setGalleryDeleting(false)
  }
}

useEffect(() => {
  if (!authenticated || !token) return

  if (isParticipantPage) { void loadRegistrationStatus() }
  if (isFeedbackPage) { void loadAdminFeedback(); return }
  if (isHomeSectionsPage) { void loadHomepageSections(); return }

  if (isGalleryPage) {
    void loadGalleryPhotos()
    void loadGalleryStorage()
    return
  }

  if (!isParticipantPage) {
    void loadGalleryStorage()
  }
}, [authenticated, token, isGalleryPage, isParticipantPage, isFeedbackPage, isHomeSectionsPage])

useEffect(() => {
  const storedToken =
    sessionStorage.getItem('nhym_admin_token')

  if (!storedToken) {
    setCheckingSession(false)
    return
  }

  void (async () => {
    const ok = await load(storedToken)

    if (ok) {
      setToken(storedToken)
      setAuthenticated(true)
    } else {
      sessionStorage.removeItem(
        'nhym_admin_token'
      )

      setToken('')
    }

    setCheckingSession(false)
  })()
  // Validate an existing session only when this page opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
				
  function beginParticipantEdit(participant: Participant) {
    setEditingParticipantId(participant.id)
    setParticipantDraft({
      name: participant.name || '', dob: participant.dob || '', gender: participant.gender || '',
      address: participant.address || '', district: participant.district || '', state: participant.state || '',
      pin: participant.pin || '', reason: '', privacyRequestId: new URLSearchParams(window.location.search).get('privacyRequestId') || ''
    })
    setError('')
    setSuccess('')
  }

  async function loadParticipantAudit(participant: Participant) {
    setParticipantAuditId(participant.id)
    setParticipantAuditLoading(true); setError('')
    try {
      const response = await fetch(`/api/admin/participants/${participant.id}/audit`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      const result = await response.json() as { entries?: typeof participantAudit; error?: string }
      if (!response.ok) throw new Error(result.error || 'Correction audit history could not be loaded.')
      setParticipantAudit(Array.isArray(result.entries) ? result.entries : [])
      setParticipantAuditId(participant.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Correction audit history could not be loaded.')
      setParticipantAudit([])
      setParticipantAuditId(participant.id)
    } finally { setParticipantAuditLoading(false) }
  }

  async function saveParticipantCorrection(participant: Participant) {
    if (!token || participantDraft.reason.trim().length < 5) {
      setError('Correction reason is required (at least 5 characters).')
      return
    }
    if (!window.confirm(`Save the reviewed corrections for ${participant.name || 'this participant'}? This change will be recorded in the audit history.`)) return
    setParticipantSaving(true); setError(''); setSuccess('')
    try {
      const response = await fetch(`/api/admin/participants/${participant.id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: participantDraft.name, dob: participantDraft.dob, gender: participantDraft.gender,
          address: participantDraft.address, district: participantDraft.district, state: participantDraft.state,
          pin: participantDraft.pin, reason: participantDraft.reason,
          privacyRequestId: participantDraft.privacyRequestId || undefined
        })
      })
      const result = await response.json() as { ok?: boolean; error?: string; updatedFields?: string[] }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Participant correction could not be saved.')
      await load()
      setEditingParticipantId(null)
      setSuccess(`Participant data corrected. Updated fields: ${(result.updatedFields || []).join(', ')}. Audit history recorded.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Participant correction could not be saved.')
    } finally { setParticipantSaving(false) }
  }

  async function changePaymentStatus(row: Row, payment: PaymentRecord, status: 'VERIFIED' | 'REJECTED' | 'PENDING') {
    if (!payment.id) {
      setError('This is a legacy payment record. Use the existing registration-level verification action.')
      return
    }
    const prompt = status === 'VERIFIED' ? 'Confirm that this transaction has been checked against the bank/UPI/cash receipt?' : status === 'REJECTED' ? 'Reject this payment transaction?' : 'Reset this transaction to pending verification?'
    if (!window.confirm(`${prompt}\n\nRegistration: ${row.registration_id}\nReference: ${payment.payment_reference}\nAmount: ₹${Number(payment.amount).toLocaleString('en-IN')}`)) return
    setUpdatingId(row.id)
    setUpdatingPaymentStatus(status)
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`/api/admin/registrations/${row.id}/payments/${payment.id}`,  {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      const result = await readAdminApiJson<{ ok?: boolean; error?: string }>(response, 'Payment verification')
      if (!response.ok || !result.ok) throw new Error(result.error || 'Payment status could not be updated.')
      await load()
      setSuccess(`Transaction ${payment.payment_no} marked ${status}.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Payment status could not be updated.')
    } finally {
      setUpdatingId(null)
      setUpdatingPaymentStatus(null)
    }
  }

  async function changeStatus(
    row: Row,
    value: 'PAYMENT_VERIFIED' | 'APPROVED' | 'REJECTED'
  ) {
    let message = ''

    if (value === 'PAYMENT_VERIFIED') {
      message =
        `Confirm payment verification for ${row.registration_id}?\n\n` +
        `Payment: ${row.payment_mode}\n` +
        `Reference: ${row.payment_reference}\n` +
        `Amount: ₹${row.total_amount.toLocaleString('en-IN')}`
    }

    if (value === 'APPROVED') {
      message =
        `Approve ${row.registration_id}?\n\n` +
        `The registration will be approved and the participant's ` +
        `approval email will be sent automatically if it has not already been sent.`
    }

    if (value === 'REJECTED') {
      message =
        `Reject ${row.registration_id}?\n\n` +
        `Please confirm that you want to mark this registration as REJECTED.`
    }

    if (!window.confirm(message)) {
      return
    }

    setUpdatingId(row.id)
    setUpdatingStatus(value)
    setError('')
    setSuccess('')

    try {
      const r = await fetch(
        `/api/admin/registrations/${row.id}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: value,
          }),
        }
      )

      const j = await readAdminApiJson<{
        ok?: boolean
        status?: string
        emailSent?: boolean
        error?: string
      }>(r, 'Registration status')

      if (!r.ok) {
        throw new Error(
          j.error || 'Could not update registration.'
        )
      }

      if (value === 'PAYMENT_VERIFIED') {
        setSuccess(
          `${row.registration_id}: Payment successfully verified.`
        )
      }

      if (value === 'APPROVED') {
        setSuccess(
          j.emailSent
            ? `${row.registration_id}: Registration approved and approval email sent.`
            : `${row.registration_id}: Registration approved. No duplicate approval email was sent.`
        )
      }

      if (value === 'REJECTED') {
        setSuccess(
          `${row.registration_id}: Registration marked as rejected.`
        )
      }

      await load()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update registration.'
      )
    } finally {
      setUpdatingId(null)
      setUpdatingStatus(null)
    }
  }

  const stats = useMemo(() => {
    const totalRegistrations = rows.length

    const totalParticipants = rows.reduce(
      (sum, row) => sum + Number(row.participant_count || 0),
      0
    )

    const pending = rows.filter(
      row => row.status === 'PENDING'
    ).length

    const paymentVerified = rows.filter(
      row => row.status === 'PAYMENT_VERIFIED'
    ).length

    const approved = rows.filter(
      row => row.status === 'APPROVED'
    ).length

    const rejected = rows.filter(
      row => row.status === 'REJECTED'
    ).length

    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    )

    const approvedAmount = rows
  .filter((row) => row.status === 'APPROVED')
  .reduce((sum, row) => sum + Number(row.total_amount || 0), 0)

    return {
      totalRegistrations,
      totalParticipants,
      pending,
      paymentVerified,
      approved,
      rejected,
      totalAmount,
      approvedAmount,
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) {
      return rows
    }

    return rows.filter(row => {
      const participantNames =
        row.participants
          ?.map(p => p.name)
          .join(' ')
          .toLowerCase() || ''

      return (
        row.registration_id?.toLowerCase().includes(q) ||
        row.email?.toLowerCase().includes(q) ||
        row.payment_reference?.toLowerCase().includes(q) ||
        row.status?.toLowerCase().includes(q) ||
        participantNames.includes(q)
      )
    })
  }, [rows, search])
function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(
    ['\uFEFF' + content],
    { type: 'text/csv;charset=utf-8;' }
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

function exportRegistrationsCsv() {
  if (filteredRows.length === 0) {
    window.alert('There are no registrations to export.')
    return
  }

  const headers = [
    'Registration ID',
    'Primary Participant',
    'Email',
    'Participants',
    'Total Amount',
    'Payment Mode',
    'Payment Reference',
    'Status',
    'Submitted',
    'Approval Email Sent',
  ]

  const data = filteredRows.map(row => [
    row.registration_id,
    row.participants?.[0]?.name || '',
    row.email,
    row.participant_count,
    row.total_amount,
    row.payment_mode,
    row.payment_reference,
    row.status,
    new Date(row.created_at).toLocaleString('en-IN'),
    row.approval_email_sent_at
      ? new Date(row.approval_email_sent_at).toLocaleString('en-IN')
      : '',
  ])

  const csv = [
    headers.map(csvCell).join(','),
    ...data.map(row =>
      row.map(csvCell).join(',')
    ),
  ].join('\r\n')

  const date = new Date()
    .toISOString()
    .slice(0, 10)

  downloadCsv(
    `NHYM-2026-Registrations-${date}.csv`,
    csv
  )
}

function exportRegistrationsPdf() {
  if (filteredRows.length === 0) {
    window.alert('There are no registrations to export.')
    return
  }

  const rows = filteredRows.map(row => [
    row.registration_id || '—',
    row.participants?.[0]?.name || '—',
    String(row.participant_count || 0),
    `₹${Number(row.total_amount || 0).toLocaleString('en-IN')}`,
    row.payment_mode?.toUpperCase() || '—',
    row.payment_reference || '—',
    row.status?.replace(/_/g, ' ') || '—',
    new Date(row.created_at).toLocaleString('en-IN'),
  ])

  const totalAmount = filteredRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  const totalParticipants = filteredRows.reduce((sum, row) => sum + Number(row.participant_count || 0), 0)

  printSearchableHindiPdf({
    title: 'REGISTRATION SUMMARY REPORT',
    subtitle: 'NATIONAL HO YOUTH MEET : SIRJON • 2026',
    orientation: 'landscape',
    tables: [{
      columns: [
        { label: 'Registration ID', width: '15%' },
        { label: 'Primary Participant', width: '17%' },
        { label: 'Count', width: '6%', align: 'center' },
        { label: 'Amount', width: '10%', align: 'right' },
        { label: 'Payment', width: '9%' },
        { label: 'Reference', width: '15%' },
        { label: 'Status', width: '12%' },
        { label: 'Submitted', width: '16%' },
      ],
      rows,
    }],
    sections: [{
      title: 'Registration Totals',
      rows: [
        ['Total Registrations', String(filteredRows.length)],
        ['Total Participants', String(totalParticipants)],
        ['Total Amount', `₹${totalAmount.toLocaleString('en-IN')}`],
      ],
    }],
    footer: `Generated: ${new Date().toLocaleString('en-IN')} • Adivasi Ho Samaj Yuva Mahasabha, Jamshedpur`,
  })
}

function exportParticipantsCsv() {
  const participantRows = filteredRows.flatMap(row =>
    (row.participants || []).map(participant => ({
      registration: row,
      participant,
    }))
  )

  if (participantRows.length === 0) {
    window.alert('There are no participants to export.')
    return
  }

  const headers = [
    'Registration ID',
    'Participant No',
    'Name',
    'Date of Birth',
    'Age',
    'Gender',
    'Category',
    'Fee',
    'Address',
    'District',
    'State',
    'PIN',
    'Activities',
    'Cultural',
    'Sports',
    'From Outside',
    'Accommodation',
    'Email',
    'Payment Mode',
    'Payment Reference',
    'Registration Total',
    'Registration Status',
    'Submitted',
  ]

  const data = participantRows.map(
    ({ registration, participant }) => [
      registration.registration_id,
      participant.participant_no,
      participant.name,
      participant.dob,
      participant.age,
      participant.gender,
      participant.category,
      participant.fee,
      participant.address,
      participant.district,
      participant.state,
      participant.pin,
      activities(participant.activities_json),
      participant.cultural,
      participant.sports,
      participant.from_outside,
      participant.accommodation,
      registration.email,
      registration.payment_mode,
      registration.payment_reference,
      registration.total_amount,
      registration.status,
      new Date(registration.created_at)
        .toLocaleString('en-IN'),
    ]
  )

  const csv = [
    headers.map(csvCell).join(','),
    ...data.map(row =>
      row.map(csvCell).join(',')
    ),
  ].join('\r\n')

  const date = new Date()
    .toISOString()
    .slice(0, 10)

  downloadCsv(
    `NHYM-2026-Participants-${date}.csv`,
    csv
  )
}
async function downloadAdminRegistrationPdf(row: Row) {
  printSearchableHindiPdf({
    title: 'ADMIN REGISTRATION RECORD',
    subtitle: 'NATIONAL HO YOUTH MEET : SIRJON 2026 · Jamshedpur · 28–29 November 2026',
    orientation: 'portrait',
    sections: [
      { title: 'Registration Details', rows: [
        ['Registration ID', row.registration_id, 'pair'],
        ['Status', row.status.replace(/_/g, ' '), 'pair'],
        ['Registered Email', row.email || '—', 'pair'],
        ['Total Amount', '₹' + Number(row.total_amount || 0).toLocaleString('en-IN'), 'pair'],
        ['Payment Method', row.payment_mode?.toUpperCase() || '—', 'pair'],
        ['Payment Reference', row.payment_reference || '—', 'pair'],
        ['Submitted', new Date(row.created_at).toLocaleString('en-IN'), 'pair'],
        ['Approval Email', row.approval_email_sent_at ? 'Sent: ' + new Date(row.approval_email_sent_at).toLocaleString('en-IN') : 'Not sent', 'pair'],
      ] },
      ...(row.participants || []).map(p => ({
        title: 'Participant ' + p.participant_no + ' Details',
        rows: [
          ['Participant Name', (p.name || '—').toUpperCase(), 'full'],
          ['Category', categoryLabel(p.category), 'pair'],
          ['Participant Fee', '₹' + Number(p.fee || 0).toLocaleString('en-IN'), 'pair'],
          ['Date of Birth', p.dob || '—', 'pair'],
          ['Age', p.age || '—', 'pair'],
          ['Gender', p.gender || '—', 'pair'],
          ['PIN', p.pin || '—', 'pair'],
          ['District', p.district || '—', 'pair'],
          ['State', p.state || '—', 'pair'],
          ['Address', p.address || '—', 'full'],
          ['Accommodation Required', yesNo(p.accommodation), 'pair'],
          ['From Outside Jamshedpur', yesNo(p.from_outside), 'pair'],
          ['Cultural', p.cultural || '—', 'pair'],
          ['Sports', p.sports || '—', 'pair'],
          ['Activities', activities(p.activities_json), 'full'], 
        ],
      })),
    ],
    footer: 'Adivasi Ho Samaj Bhawan, Golmuri, Jamshedpur-831003 · nhym2026jsr@gmail.com',
  })
}
async function exportParticipantsPdf() {
  const participantRows = filteredRows.flatMap(row =>
    (row.participants || []).map(participant => ({ registration: row, participant }))
  )
  if (participantRows.length === 0) {
    window.alert('There are no participants to export.')
    return
  }
  const columns = [
    { label: 'Reg. ID', width: '12%' },
    { label: 'No.', width: '4%' },
    { label: 'Participant Name', width: '16%' },
    { label: 'Category', width: '12%' },
    { label: 'Gender', width: '7%' },
    { label: 'Age', width: '4%' },
    { label: 'District', width: '12%' },
    { label: 'State', width: '9%' },
    { label: 'Fee', width: '8%' },
    { label: 'Accommodation', width: '9%' },
    { label: 'Status', width: '7%' },
  ]
  const rows = participantRows.map(({ registration, participant }) => [
    registration.registration_id || '—',
    String(participant.participant_no || '—'),
    participant.name || '—',
    categoryLabel(participant.category),
    participant.gender ? participant.gender.charAt(0).toUpperCase() + participant.gender.slice(1).toLowerCase() : '—',
    String(participant.age || '—'),
    participant.district || '—',
    participant.state || '—',
    '₹' + Number(participant.fee || 0).toLocaleString('en-IN'),
    yesNo(participant.accommodation),
    registration.status?.replace(/_/g, ' ') || '—',
  ])
  const totalFees = participantRows.reduce((sum, item) => sum + Number(item.participant.fee || 0), 0)
  printSearchableHindiPdf({
    title: 'PARTICIPANT SUMMARY REPORT',
    subtitle: 'NATIONAL HO YOUTH MEET : SIRJON 2026 · Jamshedpur · 28–29 November 2026',
    orientation: 'landscape',
    tables: [{ columns, rows }],
    sections: [{ title: 'Summary', rows: [
      ['Total Participants', String(participantRows.length)],
      ['Registrations', String(filteredRows.length)],
      ['Total Participant Fees', '₹' + totalFees.toLocaleString('en-IN')],
    ] }],
    footer: 'Adivasi Ho Samaj Bhawan, Golmuri, Jamshedpur-831003 · nhym2026jsr@gmail.com',
  })
}

  function activities(value: string) {
    const raw = String(value || '').trim()
    if (!raw) return '—'

    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .join('\n') || '—'
      }
      if (typeof parsed === 'string') {
        return parsed.split(/,\s*/).map(item => item.trim()).filter(Boolean).join('\n') || '—'
      }
      return String(parsed || '—')
    } catch {
      // Older records may store the selected topics as comma-separated plain text.
      return raw.split(/,\s*/).map(item => item.trim()).filter(Boolean).join('\n') || '—'
    }
  }

  function statusBadge(status: string) {
    const common =
      'inline-flex rounded-full border px-3 py-1 text-xs font-semibold'

    if (status === 'APPROVED') {
      return (
        <span className={`${common} bg-green-50 text-green-700`}>
          ✓ APPROVED
        </span>
      )
    }

    if (status === 'PAYMENT_VERIFIED') {
      return (
        <span className={`${common} bg-blue-50 text-blue-700`}>
          PAYMENT VERIFIED
        </span>
      )
    }

    if (status === 'REJECTED') {
      return (
        <span className={`${common} bg-red-50 text-red-700`}>
          REJECTED
        </span>
      )
    }

    return (
      <span className={`${common} bg-yellow-50 text-yellow-700`}>
        PENDING
      </span>
    )
  }

  function actionButtons(row: Row) {
    const busy = updatingId === row.id
    const busyStatus = busy ? updatingStatus : null
    const hasTransactionLedger = (row.payments || []).some(payment => !payment.legacy && payment.id !== null)

    if (row.status === 'PENDING' && hasTransactionLedger) {
      return (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(row)}>
            View / Verify Transactions
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-busy={busyStatus === 'REJECTED'}
            disabled={busy}
            onClick={() => changeStatus(row, 'REJECTED')}
          >
            {busyStatus === 'REJECTED' ? 'Updating…' : 'Reject'}
          </Button>
        </div>
      )
    }

    if (row.status === 'PENDING') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            aria-busy={busyStatus === 'PAYMENT_VERIFIED'}
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'PAYMENT_VERIFIED')
            }
          >
            {busyStatus === 'PAYMENT_VERIFIED' ? 'Updating…' : 'Verify Payment'}
          </Button>

          <Button
            variant="outline"
            aria-busy={busyStatus === 'REJECTED'}
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'REJECTED')
            }
          >
            Reject
          </Button>
        </div>
      )
    }

    if (row.status === 'PAYMENT_VERIFIED') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            aria-busy={busyStatus === 'APPROVED'}
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'APPROVED')
            }
          >
            {busyStatus === 'APPROVED' ? 'Updating…' : 'Approve Registration'}
          </Button>

          <Button
            variant="outline"
            aria-busy={busyStatus === 'REJECTED'}
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'REJECTED')
            }
          >
            Reject
          </Button>
        </div>
      )
    }

    if (row.status === 'APPROVED') {
      return (
        <div className="text-sm font-medium">
          ✓ Registration complete
        </div>
      )
    }

    if (row.status === 'REJECTED') {
      return (
        <div className="text-sm font-medium">
          Registration rejected
        </div>
      )
    }

    return null
  }

if (checkingSession) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-gutter">
      <div className="text-sm text-muted-foreground">
        Checking admin session…
      </div>
    </main>
  )
}

if (!authenticated) {
  return (
    <main data-auth-screen-glow="true" className="grid min-h-dvh place-items-center bg-background px-gutter py-10">
      <style>{`[data-auth-screen-glow="true"] button:active:not(:disabled), [data-auth-screen-glow="true"] button:focus-visible:not(:disabled) { outline: 2px solid var(--ring) !important; outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 42%, transparent), 0 0 22px color-mix(in oklch, var(--primary) 68%, transparent) !important; filter: brightness(1.12); } [data-auth-screen-glow="true"] button[aria-busy="true"] { outline: 2px solid var(--ring) !important; outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 48%, transparent), 0 0 24px color-mix(in oklch, var(--primary) 72%, transparent) !important; animation: auth-button-processing-glow 900ms ease-in-out infinite !important; } @keyframes auth-button-processing-glow { 0%, 100% { box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 34%, transparent), 0 0 12px color-mix(in oklch, var(--primary) 48%, transparent); filter: brightness(1.04); } 50% { box-shadow: 0 0 0 5px color-mix(in oklch, var(--primary) 62%, transparent), 0 0 26px color-mix(in oklch, var(--primary) 82%, transparent); filter: brightness(1.22); } }`}</style>
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">National Ho Youth Meet 2026</p>
        <h1 className="mt-2 text-3xl font-semibold">Admin Login</h1>
        <p className="mt-3 text-sm text-muted-foreground">Main Admin aur Finance ke liye shared secure login page ka upyog karein.</p>
        {error && <div role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</div>}
        <button type="button" onClick={() => { window.location.href = '/login?role=admin' }} className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">Continue to Shared Login</button>
        <a href="/" className="mt-4 inline-block text-sm underline underline-offset-4">← Back to NHYM website</a>
      </div>
    </main>
  )
}
  return (
    <main data-participant-management={isParticipantPage ? 'true' : undefined} className="min-h-dvh bg-background px-gutter py-10">
      {isParticipantPage && <style>{`[data-participant-management="true"] button:active:not(:disabled), [data-participant-management="true"] [data-slot="button"]:active:not(:disabled) { outline: 2px solid var(--ring) !important; outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 42%, transparent), 0 0 22px color-mix(in oklch, var(--primary) 68%, transparent) !important; filter: brightness(1.12); } [data-participant-management="true"] button[aria-busy="true"], [data-participant-management="true"] [data-slot="button"][aria-busy="true"] { outline: 2px solid var(--ring) !important; outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 48%, transparent), 0 0 24px color-mix(in oklch, var(--primary) 72%, transparent) !important; animation: participant-button-processing-glow 900ms ease-in-out infinite !important; } @keyframes participant-button-processing-glow { 0%, 100% { box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 34%, transparent), 0 0 12px color-mix(in oklch, var(--primary) 48%, transparent); filter: brightness(1.04); } 50% { box-shadow: 0 0 0 5px color-mix(in oklch, var(--primary) 62%, transparent), 0 0 26px color-mix(in oklch, var(--primary) 82%, transparent); filter: brightness(1.22); } }`}</style> }
      <style>{`[data-admin-dashboard-glow="true"]:active:not(:disabled) { outline: 2px solid var(--ring) !important; outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 42%, transparent), 0 0 22px color-mix(in oklch, var(--primary) 68%, transparent) !important; filter: brightness(1.12); } [data-admin-dashboard-glow="true"][aria-busy="true"] { outline: 2px solid var(--ring) !important; outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 48%, transparent), 0 0 24px color-mix(in oklch, var(--primary) 72%, transparent) !important; animation: admin-dashboard-button-processing-glow 900ms ease-in-out infinite !important; } @keyframes admin-dashboard-button-processing-glow { 0%, 100% { box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 34%, transparent), 0 0 12px color-mix(in oklch, var(--primary) 48%, transparent); filter: brightness(1.04); } 50% { box-shadow: 0 0 0 5px color-mix(in oklch, var(--primary) 62%, transparent), 0 0 26px color-mix(in oklch, var(--primary) 82%, transparent); filter: brightness(1.22); } }`}</style>
      <div className="mx-auto max-w-content">

        <div className="flex flex-wrap items-start justify-between gap-4">
  <div>
    <h1 className="text-4xl">
      {isHomeSectionsPage ? 'Homepage Section Visibility' : isFeedbackPage ? 'Feedback Management' : isGalleryPage
        ? 'Gallery Management'
        : isParticipantPage
          ? 'Participant Management'
          : 'NHYM 2026 Admin Dashboard'}
    </h1>

    <p className="mt-2 text-muted-foreground">
      {isHomeSectionsPage ? 'होम पेज पर महत्वपूर्ण सूचना और लोगों की प्रतिक्रियाएँ दिखाने या छिपाने का नियंत्रण।' : isFeedbackPage ? 'सार्वजनिक प्रतिक्रियाएँ देखें और एक या अनेक प्रतिक्रियाएँ हटाएँ।' : isGalleryPage
        ? 'Upload and manage photos for the NHYM website gallery.'
        : isParticipantPage
          ? 'Manage registrations, verify payments and approve participants.'
          : 'Overview of NHYM 2026 registrations and gallery storage.'}
    </p>
  </div>

  <Button
    variant="outline"
    data-admin-dashboard-glow="true"
    onClick={logout}
  >
    Logout
  </Button>
</div>
        
 {error && (
	 <div className="mt-4 rounded-lg border border-destructive p-4 text-destructive">
    	 <strong>Error:</strong> {error}
      </div> 
)}

        {success && (
          <div className="mt-4 rounded-lg border bg-card p-4">
            ✓ {success}
          </div>
        )}

{!isGalleryPage && !isParticipantPage && !isFeedbackPage && !isHomeSectionsPage && (
  <section className="mt-8">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Total Registrations</div>
        <div className="mt-2 text-3xl font-semibold">{stats.totalRegistrations}</div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Total Participants</div>
        <div className="mt-2 text-3xl font-semibold">{stats.totalParticipants}</div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Pending</div>
        <div className="mt-2 text-3xl font-semibold">{stats.pending}</div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Approved</div>
        <div className="mt-2 text-3xl font-semibold">{stats.approved}</div>
      </div>
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Payment Verified</div>
        <div className="mt-2 text-2xl font-semibold">{stats.paymentVerified}</div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Rejected</div>
        <div className="mt-2 text-2xl font-semibold">{stats.rejected}</div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Approved Registration Amount</div>
        <div className="mt-2 text-2xl font-semibold">₹{stats.approvedAmount.toLocaleString('en-IN')}</div>
      </div>
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Total Registration Amount</div>
        <div className="mt-2 text-2xl font-semibold">₹{stats.totalAmount.toLocaleString('en-IN')}</div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Gallery Storage</div>
        <div className="mt-2 text-2xl font-semibold">
          {(galleryStorageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB / 10.00 GB
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {Math.max(0, (galleryStorageMax - galleryStorageUsed) / (1024 * 1024 * 1024)).toFixed(2)} GB remaining
        </div>
      </div>
    </div>

    <div className="mt-8 grid gap-4 md:grid-cols-4">
      <button
        type="button"
        data-admin-dashboard-glow="true"
        onClick={() => { window.location.href = '/admin/participants' }}
        className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40"
      >
        <div className="text-xl font-semibold">Manage Participants →</div>
        <p className="mt-2 text-sm text-muted-foreground">
          View registrations, verify payments, approve or reject registrations, and view participant details.
        </p>
      </button>

      <button
        type="button"
        data-admin-dashboard-glow="true"
        onClick={() => { window.location.href = '/admin/gallery' }}
        className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40"
      >
        <div className="text-xl font-semibold">Manage Gallery →</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload, review and delete NHYM gallery photos and monitor storage usage.
        </p>
      </button>

      <button type="button" data-admin-dashboard-glow="true" onClick={() => { window.location.href = '/admin/homepage-sections' }} className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40">
        <div className="text-xl font-semibold">Homepage Section Visibility →</div>
        <p className="mt-2 text-sm text-muted-foreground">महत्वपूर्ण सूचना और लोगों की प्रतिक्रियाओं को होम पेज पर दिखाएँ या छिपाएँ।</p>
      </button>

      <button type="button" data-admin-dashboard-glow="true" onClick={() => { window.location.href = '/admin/feedback' }} className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40">
        <div className="text-xl font-semibold">Manage Feedback →</div>
        <p className="mt-2 text-sm text-muted-foreground">सार्वजनिक प्रतिक्रियाएँ देखें और एक या कई प्रतिक्रियाएँ चुनकर हटाएँ।</p>
      </button>

      <button
        type="button"
        data-admin-dashboard-glow="true"
        onClick={() => { window.location.href = '/admin/finance' }}
        className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40"
      >
        <div className="text-xl font-semibold">Finance Management →</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Record expenses, submit approval requests, record payments and export the finance register.
        </p>
      </button>

      <button
        type="button"
        data-admin-dashboard-glow="true"
        onClick={() => { window.location.href = '/admin/privacy-requests' }}
        className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40"
      >
        <div className="text-xl font-semibold">Privacy Requests &amp; Audit →</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Review data access, correction, deletion and consent requests; verify identity and review sensitive-data access history.
        </p>
      </button>
    </div>

    <section className="mt-6 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Finance Account Recovery</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only the Main Admin can reset Finance Head and Finance Member passwords.</p>
        </div>
        <Button type="button" variant="outline" data-admin-dashboard-glow="true" aria-busy={adminFinanceLoading} disabled={adminFinanceLoading} onClick={() => showAdminFinanceUsers ? setShowAdminFinanceUsers(false) : void loadAdminFinanceUsers()}>
          {adminFinanceLoading ? 'Loading...' : showAdminFinanceUsers ? 'Hide Finance Accounts' : 'Manage Finance Accounts'}
        </Button>
      </div>
      {adminFinanceError && <div className="mt-4 rounded-lg border border-destructive p-3 text-sm text-destructive">{adminFinanceError}</div>}
      {adminFinanceNotice && <div className="mt-4 rounded-lg border p-3 text-sm">{adminFinanceNotice}</div>}
      {showAdminFinanceUsers && <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead><tr className="border-b"><th className="p-2">Name</th><th className="p-2">Login ID</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2">Reset Password</th></tr></thead>
          <tbody>{adminFinanceUsers.map(user => <tr key={user.id} className="border-b align-top">
            <td className="p-2">{user.display_name}</td><td className="p-2">{user.login_id}</td><td className="p-2">{user.role.replace('_',' ')}</td><td className="p-2">{user.is_active ? 'Active' : 'Inactive'}</td>
            <td className="p-2"><div className="flex min-w-[280px] gap-2">
              <Input type="password" autoComplete="new-password" minLength={12} value={resetFinanceUserId === user.id ? resetFinancePassword : ''} onChange={e => { setResetFinanceUserId(user.id); setResetFinancePassword(e.target.value) }} placeholder="Temporary password (12+)" className="max-w-[210px]" />
              <Button type="button" size="sm" disabled={adminFinanceLoading || resetFinanceUserId !== user.id || resetFinancePassword.length < 12} onClick={() => void resetAdminFinancePassword(user.id)}>Reset</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="mt-3 text-xs text-muted-foreground">The old password cannot be viewed. After reset, all sessions for that account are revoked. Use a unique temporary password and share it privately with the account holder.</p>
    </section>
  </section>
)}

{isHomeSectionsPage && (
  <section className="mt-8 rounded-xl border bg-card p-5 sm:p-6">
    <h2 className="text-2xl font-semibold">होम पेज सेक्शन नियंत्रण</h2>
    <p className="mt-2 text-sm text-muted-foreground">किसी सेक्शन को बंद करने से वह केवल सार्वजनिक होम पेज से छिपेगा। उसका मूल डेटा सुरक्षित रहेगा और आप उसे बाद में फिर से दिखा सकते हैं।</p>
    {homeSectionsLoading ? <p className="mt-5 text-sm text-muted-foreground">सेटिंग लोड हो रही हैं…</p> : (
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
          <input type="checkbox" className="mt-1 size-5" checked={homeSections.importantNotice} onChange={e => setHomeSections(current => ({ ...current, importantNotice: e.target.checked }))} />
          <span><span className="block font-semibold">📢 महत्वपूर्ण सूचना</span><span className="mt-1 block text-sm text-muted-foreground">होम पेज पर महत्वपूर्ण सूचना वाला पूरा सेक्शन दिखाएँ।</span><span className="mt-2 block text-sm font-medium">{homeSections.importantNotice ? 'स्थिति: दिखाई देगा' : 'स्थिति: छिपा रहेगा'}</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
          <input type="checkbox" className="mt-1 size-5" checked={homeSections.publicFeedback} onChange={e => setHomeSections(current => ({ ...current, publicFeedback: e.target.checked }))} />
          <span><span className="block font-semibold">💬 लोगों की प्रतिक्रियाएँ</span><span className="mt-1 block text-sm text-muted-foreground">होम पेज पर प्रतिक्रिया फॉर्म और प्रकाशित प्रतिक्रियाएँ दिखाएँ।</span><span className="mt-2 block text-sm font-medium">{homeSections.publicFeedback ? 'स्थिति: दिखाई देगा' : 'स्थिति: छिपा रहेगा'}</span></span>
        </label>
      </div>
    )}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button type="button" onClick={() => void saveHomepageSections()} disabled={homeSectionsLoading || homeSectionsSaving}>{homeSectionsSaving ? 'सेव हो रहा है…' : 'सेटिंग सेव करें'}</Button>
      <Button type="button" variant="outline" onClick={() => void loadHomepageSections()} disabled={homeSectionsLoading || homeSectionsSaving}>रीफ़्रेश</Button>
      <Button type="button" variant="outline" onClick={() => { window.location.href = '/admin' }}>← Admin Dashboard</Button>
    </div>
  </section>
)}

{isFeedbackPage && (
  <section className="mt-8 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">सार्वजनिक प्रतिक्रियाएँ</h2><p className="mt-1 text-sm text-muted-foreground">कुल: {feedbackItems.length} · चुनी गई: {selectedFeedbackIds.length}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void loadAdminFeedback()} disabled={feedbackLoading || feedbackDeleting}>Refresh</Button>
        <Button type="button" variant="outline" onClick={() => setSelectedFeedbackIds(selectedFeedbackIds.length === feedbackItems.length ? [] : feedbackItems.map(item => item.id))} disabled={!feedbackItems.length || feedbackDeleting}>{selectedFeedbackIds.length === feedbackItems.length ? 'सबका चयन हटाएँ' : 'सभी चुनें'}</Button>
        <Button type="button" onClick={() => void deleteSelectedFeedback()} disabled={!selectedFeedbackIds.length || feedbackDeleting}>{feedbackDeleting ? 'हटाया जा रहा है…' : `चुनी प्रतिक्रियाएँ हटाएँ (${selectedFeedbackIds.length})`}</Button>
      </div>
    </div>
    {feedbackLoading ? <p className="mt-6 text-sm text-muted-foreground">प्रतिक्रियाएँ लोड हो रही हैं…</p> : feedbackItems.length === 0 ? <p className="mt-6 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">अभी कोई सार्वजनिक प्रतिक्रिया उपलब्ध नहीं है।</p> : <div className="mt-5 space-y-3">
      {feedbackItems.map(item => <label key={item.id} className="flex min-w-0 items-start gap-3 rounded-lg border p-4">
        <input type="checkbox" className="mt-1 size-4 shrink-0" checked={selectedFeedbackIds.includes(item.id)} onChange={event => setSelectedFeedbackIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
        <span className="min-w-0 flex-1"><span className="block break-words font-semibold">{item.name}{item.city ? ` · ${item.city}` : ''}</span><span className="mt-1 block break-words text-xs font-semibold text-brand">{item.category}</span><span className="mt-2 block whitespace-pre-wrap break-words text-sm">{item.message}</span><span className="mt-2 block text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('hi-IN')}</span></span>
      </label>)}
    </div>}
    <Button type="button" variant="outline" className="mt-5" onClick={() => { window.location.href = '/admin' }}>← Admin Dashboard</Button>
  </section>
)}

        {isGalleryPage && (
  /* GALLERY-MANAGEMENT */
<section className="mt-8 rounded-xl border bg-card p-6">
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 className="text-2xl font-semibold">Gallery Management</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload and manage photos for the NHYM website gallery.
      </p>
    </div>

    <Button
      type="button"
      variant="outline"
      onClick={() => void loadGalleryPhotos()}
      disabled={galleryLoading}
    >
      {galleryLoading ? 'Loading...' : 'Refresh Gallery'}
    </Button>
  </div>

  <div className="mt-6 grid gap-4 md:grid-cols-2">
    <div>
  <label className="mb-2 block text-sm font-medium">
    Photos
  </label>
  <Input
    type="file"
    accept="image/jpeg,image/png,image/webp"
    multiple
    onChange={(event) =>
      setGalleryFiles(Array.from(event.target.files ?? []))
    }
  />

  <p className="mt-2 text-xs text-muted-foreground">
    Select multiple JPEG, PNG or WebP photos • Maximum 20 MB per photo • 4K/8K supported
  </p>

  {galleryFiles.length > 0 && (
    <p className="mt-2 text-sm font-medium">
      {galleryFiles.length} photo
      {galleryFiles.length === 1 ? '' : 's'} selected
    </p>
    )}
    {galleryFiles.length > 0 && (
  <div className="mt-2 rounded-lg border bg-muted/20 p-3 text-sm">
    <div className="flex justify-between gap-3">
      <span>Selected photos size</span>
      <span className="font-medium">
        {(gallerySelectedBytes / (1024 * 1024)).toFixed(2)} MB
      </span>
    </div>

    <div className="mt-1 flex justify-between gap-3">
      <span>Storage after upload</span>
      <span className="font-medium">
        {(galleryStorageAfterSelection / (1024 * 1024 * 1024)).toFixed(2)} GB / 10.00 GB
      </span>
    </div>

    <div
      className={
        galleryStorageExceeded
          ? 'mt-2 font-semibold text-destructive'
          : 'mt-2 font-semibold text-green-600'
      }
    >
      {galleryStorageExceeded
        ? 'Storage limit exceeded — remove some photos before uploading.'
        : `${(
            (galleryStorageMax - galleryStorageAfterSelection) /
            (1024 * 1024 * 1024)
          ).toFixed(2)} GB remaining after upload`}
    </div>
  </div>
)}
</div>

    <div>
      <label className="mb-2 block text-sm font-medium">
        Category
      </label>
      <select
        value={galleryCategory}
        onChange={(event) => setGalleryCategory(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {GALLERY_CATEGORIES.map((category) => (
          <option key={category} value={category}>{category}</option>
        ))}
      </select>
    </div>

    <div>
      <label className="mb-2 block text-sm font-medium">
        Caption
      </label>
      <Input
        value={galleryCaption}
        onChange={(event) => setGalleryCaption(event.target.value)}
        placeholder="Optional caption"
      />
    </div>
  </div>

  {galleryError && (
    <div className="mt-4 rounded-lg border border-destructive p-3 text-sm text-destructive">
      {galleryError}
    </div>
  )}

  <div className="mt-5">
    <Button
  type="button"
  onClick={() => void uploadGalleryPhotos()}
  disabled={
  galleryUploading ||
  galleryFiles.length === 0 ||
  galleryStorageExceeded
}
>
  {galleryUploading
    ? 'Uploading Photos...'
    : `Upload ${galleryFiles.length > 0 ? `${galleryFiles.length} ` : ''}Photo${galleryFiles.length === 1 ? '' : 's'}`}
</Button>
  </div>

  <div className="mt-8">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Button
  type="button"
  variant="outline"
  onClick={() => {
    if (selectedGalleryIds.length === galleryPhotos.length) {
      setSelectedGalleryIds([])
    } else {
      setSelectedGalleryIds(galleryPhotos.map((photo) => photo.id))
    }
  }}
  disabled={galleryPhotos.length === 0}
>
  {selectedGalleryIds.length === galleryPhotos.length
    ? 'Deselect All'
    : 'Select All'}
</Button>
  <Button
    type="button"
    variant="outline"
    onClick={() => void deleteSelectedGalleryPhotos()}
    disabled={galleryDeleting || selectedGalleryIds.length === 0}
  >
    {galleryDeleting
      ? 'Deleting...'
      : `Delete Selected${selectedGalleryIds.length > 0 ? ` (${selectedGalleryIds.length})` : ''}`}
  </Button>
</div>
    <h3 className="text-lg font-semibold">
      Uploaded Photos ({galleryPhotos.length})
    </h3>
    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
  <div className="flex items-center justify-between gap-3 text-sm">
    <span className="font-medium">Gallery Storage</span>
    <span className="font-semibold">
      {(galleryStorageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB / 10.00 GB
    </span>
  </div>

  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
    <div
      className="h-full rounded-full bg-primary transition-all"
      style={{
        width: `${Math.min(
          100,
          (galleryStorageUsed / galleryStorageMax) * 100
        )}%`,
      }}
    />
  </div>

  <div className="mt-2 text-xs text-muted-foreground">
    {Math.max(
      0,
      (galleryStorageMax - galleryStorageUsed) /
        (1024 * 1024 * 1024)
    ).toFixed(2)}{' '}
    GB remaining
  </div>
</div>

    {galleryLoading ? (
      <p className="mt-4 text-sm text-muted-foreground">
        Loading gallery...
      </p>
    ) : galleryPhotos.length === 0 ? (
      <p className="mt-4 text-sm text-muted-foreground">
        No gallery photos uploaded yet.
      </p>
    ) : (
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {galleryPhotos.map((photo) => (
          <div
            key={photo.id}
            className="overflow-hidden rounded-xl border bg-background"
          >
                      <label className="flex items-center gap-2 border-b px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={selectedGalleryIds.includes(photo.id)}
              onChange={(event) => {
                setSelectedGalleryIds((current) =>
                  event.target.checked
                    ? [...current, photo.id]
                    : current.filter((id) => id !== photo.id)
                )
              }}
            />
            <span>Select photo</span>
          </label>
            <div className="flex h-56 items-center justify-center bg-muted/30">
              <img
                src={photo.imageUrl}
                alt={photo.title}
                loading="lazy"
                className="h-full w-full object-contain"
              />
            </div>

            <div className="p-4">
              <div className="font-semibold">{photo.title}</div>

              {photo.caption && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {photo.caption}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{photo.category}</span>
                <span>•</span>
                <span>
                  {photo.fileSize != null
  ? `${(photo.fileSize / (1024 * 1024)).toFixed(2)} MB`
  : 'Size unavailable'}
                </span>
              </div>

              <div className="mt-4 border-t pt-3">
                {galleryEditingId === photo.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Image Name
                      </label>
                      <Input
                        value={galleryEditTitle}
                        onChange={(event) => setGalleryEditTitle(event.target.value)}
                        placeholder="Enter image name"
                        maxLength={200}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Caption / Details
                      </label>
                      <textarea
                        value={galleryEditCaption}
                        onChange={(event) => setGalleryEditCaption(event.target.value)}
                        placeholder="Enter image details"
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Category
                      </label>
                      <select
                        value={galleryEditCategory}
                        onChange={(event) => setGalleryEditCategory(event.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {!GALLERY_CATEGORIES.includes(galleryEditCategory as typeof GALLERY_CATEGORIES[number]) && (
                          <option value={galleryEditCategory}>{galleryEditCategory}</option>
                        )}
                        {GALLERY_CATEGORIES.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => void saveGalleryDetails(photo.id)}
                        disabled={gallerySavingId !== null}
                      >
                        {gallerySavingId === photo.id ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setGalleryEditingId(null)
                          setGalleryError('')
                        }}
                        disabled={gallerySavingId !== null}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setGalleryEditingId(photo.id)
                      setGalleryEditTitle(photo.title || '')
                      setGalleryEditCaption(photo.caption || '')
                      setGalleryEditCategory(photo.category || 'NHYM Events')
                      setGalleryError('')
                      setSuccess('')
                    }}
                  >
                    Edit Details
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
</section>
)}
        {isParticipantPage && (
          <>
            <section className="mt-8 rounded-xl border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Registration Control</h2>
                  <p className="mt-1 text-sm text-muted-foreground">कार्यक्रम से कुछ दिन पहले नए रजिस्ट्रेशन बंद करें। पुराने रिकॉर्ड, भुगतान और approval पर कोई असर नहीं पड़ेगा।</p>
                  <p className={`mt-3 text-sm font-semibold ${registrationOpen ? 'text-green-700' : 'text-destructive'}`}>
                    वर्तमान स्थिति: {registrationControlLoading ? 'जाँच हो रही है…' : registrationOpen ? '🟢 Registration Open' : '🔴 Registration Closed'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" aria-busy={registrationControlSaving && registrationControlTarget === true} disabled={registrationControlLoading || registrationControlSaving || registrationOpen} onClick={() => void saveRegistrationStatus(true)}>Registration चालू करें</Button>
                  <Button type="button" variant="destructive" aria-busy={registrationControlSaving && registrationControlTarget === false} disabled={registrationControlLoading || registrationControlSaving || !registrationOpen} onClick={() => {
                    if (window.confirm('क्या आप नया registration बंद करना चाहते हैं? पहले से दर्ज सभी रिकॉर्ड सुरक्षित रहेंगे।')) void saveRegistrationStatus(false)
                  }}>Registration बंद करें</Button>
                  <Button type="button" variant="outline" aria-busy={registrationControlLoading} disabled={registrationControlLoading || registrationControlSaving} onClick={() => void loadRegistrationStatus()}>रीफ़्रेश</Button>
                </div>
              </div>
            </section>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Total Registrations
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.totalRegistrations}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Total Participants
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.totalParticipants}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Pending
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.pending}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Payment Verified
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.paymentVerified}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Approved
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.approved}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5">
                <div className="text-sm text-muted-foreground">
                  Rejected
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {stats.rejected}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5 sm:col-span-1">
                <div className="text-sm text-muted-foreground">
                  Total Registration Amount
                </div>

                <div className="mt-2 text-3xl font-semibold">
                  ₹{stats.totalAmount.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5 sm:col-span-1">
  <div className="text-sm text-muted-foreground">
    Approved Registration Amount
  </div>

  <div className="mt-2 text-3xl font-semibold">
    ₹{stats.approvedAmount.toLocaleString('en-IN')}
  </div>
</div>

            </div>

            <div className="mt-8 flex flex-nowrap items-center gap-3 overflow-x-auto pb-1">
  <Button
    className="shrink-0"
    variant="outline"
    onClick={exportRegistrationsCsv}
    disabled={filteredRows.length === 0}
  >
    Export Registrations CSV
  </Button>

  <Button
    className="shrink-0"
    variant="outline"
    onClick={() => void exportRegistrationsPdf()}
    disabled={filteredRows.length === 0}
  >
    Export Registrations PDF
  </Button>

  <Button
    className="shrink-0"
    variant="outline"
    onClick={exportParticipantsCsv}
    disabled={filteredRows.length === 0}
  >
    Export Participants CSV
  </Button>

  <Button
    className="shrink-0"
    variant="outline"
    onClick={() => void exportParticipantsPdf()}
    disabled={filteredRows.length === 0}
  >
    Export Participants PDF
  </Button>
</div>

<div className="mt-3 w-full max-w-xl">
  <Input
    value={search}
    onChange={e => setSearch(e.target.value)}
    placeholder="Search ID, name, email, payment reference or status"
  />
</div>

            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredRows.length} of {rows.length} registrations
            </div>
          </>
        )}
    {isParticipantPage && (
      <>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">

    <thead>
      <tr className="border-b text-left">
        <th className="p-3">Registration ID</th>
        <th className="p-3">Name</th>
        <th className="p-3 text-center">Participants</th>
        <th className="p-3">Amount</th>
        <th className="p-3">Status</th>
        <th className="p-3">Action</th>
        <th className="p-3">Details</th>
      </tr>
    </thead>

    <tbody>
      {filteredRows.length === 0 ? (
        <tr>
          <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'No registrations found.' : 'No registrations match your search.'}
          </td>
        </tr>
      ) : (
        filteredRows.map(row => (
        <>
        <tr
          key={row.id}
          className="border-b align-middle"
        >
          <td className="p-3 font-mono whitespace-nowrap">
            {row.registration_id}
          </td>

          <td className="p-3 font-medium">
            {row.participants?.[0]?.name || '—'}

            {row.participant_count > 1 && (
              <div className="mt-1 text-xs text-muted-foreground">
                +{row.participant_count - 1} more participant
                {row.participant_count > 2 ? 's' : ''}
              </div>
            )}
          </td>

          <td className="p-3 text-center">
            {row.participant_count}
          </td>

          <td className="p-3 whitespace-nowrap font-medium">
            ₹{row.total_amount.toLocaleString('en-IN')}
          </td>

          <td className="p-3">
            {statusBadge(row.status)}
          </td>

          <td className="p-3">
            {actionButtons(row)}
          </td>

          <td className="p-3">
            <Button
              variant="outline"
              onClick={() => setSelected(row)}
            >
              View Details
            </Button>
          </td>
        </tr>
        {selected?.id === row.id && (
          <tr>
            <td colSpan={7} className="p-3">
                      {selected && (
                        <div className="mt-10 rounded-lg border p-6">
              
                          <div className="flex flex-wrap items-center justify-between gap-4">
              
                            <div>
                              <h2 className="text-2xl font-semibold">
                                Registration Details
                              </h2>
              
                              <p className="font-mono text-sm">
                                {selected.registration_id}
                              </p>
                            </div>
              
                            <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void downloadAdminRegistrationPdf(selected)
                  }
                >
                  Download PDF
                </Button>
              
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              </div>
              
                          </div>
              
                          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              
                            <div>
                              <strong>Email</strong>
                              <div>{selected.email}</div>
                            </div>
              
                            <div>
                              <strong>Total Amount</strong>
                              <div>
                                ₹{selected.total_amount.toLocaleString('en-IN')}
                              </div>
                            </div>
              
                            <div>
                              <strong>Status</strong>
                              <div className="mt-1">
                                {statusBadge(selected.status)}
                              </div>
                            </div>
              
                            <div>
                              <strong>Payment Mode</strong>
                              <div>{selected.payment_mode}</div>
                            </div>
              
                            <div>
                              <strong>Payment Reference</strong>
                              <div>{selected.payment_reference}</div>
                            </div>
              
                            <div>
                              <strong>Submitted</strong>
                              <div>
                                {new Date(
                                  selected.created_at
                                ).toLocaleString('en-IN')}
                              </div>
                            </div>
              
                            <div>
                              <strong>Approval Email</strong>
                              <div>
                                {selected.approval_email_sent_at
                                  ? '✓ Sent'
                                  : 'Not sent'}
                              </div>
                            </div>
              
                          </div>
              
                          <div className="mt-6 rounded-lg border p-4">
                            <div className="mb-3 font-semibold">
                              Registration Actions
                            </div>
              
                            {actionButtons(selected)}
                            {selected.status === 'PENDING' && (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={updatingId === selected.id}
                                aria-busy={updatingId === selected.id && updatingStatus === 'REJECTED'}
                                onClick={() => void changeStatus(selected, 'REJECTED')}
                              >
                                {updatingId === selected.id && updatingStatus === 'REJECTED'
                                  ? 'Rejecting…'
                                  : 'Reject Registration'}
                              </Button>
                            )}
                          </div>
              
                          <h3 className="mt-8 text-xl font-semibold">Payment Transactions</h3>
                          <div className="mt-4 space-y-3">
                            {(selected.payments || []).map((payment) => (
                              <section key={payment.id ?? `legacy-${payment.payment_no}`} className="rounded-lg border p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold">Transaction {payment.payment_no} · ₹{Number(payment.amount).toLocaleString('en-IN')}</div>
                                    <div className="mt-1 text-sm">Mode: {payment.payment_mode} · Reference: <span className="font-mono break-all">{payment.payment_reference}</span></div>
                                  </div>
                                  <div className="text-sm font-medium">{payment.status}{payment.legacy ? ' (legacy record)' : ''}</div>
                                </div>
                                {!payment.legacy && payment.id !== null && <div className="mt-3 flex flex-wrap gap-2">
                                  <Button type="button" size="sm" aria-busy={updatingId === selected.id && updatingPaymentStatus === 'VERIFIED'} disabled={updatingId === selected.id || payment.status === 'VERIFIED'} onClick={() => void changePaymentStatus(selected, payment, 'VERIFIED')}>Verify transaction</Button>
                                  <Button type="button" size="sm" variant="outline" aria-busy={updatingId === selected.id && updatingPaymentStatus === 'REJECTED'} disabled={updatingId === selected.id || payment.status === 'REJECTED'} onClick={() => void changePaymentStatus(selected, payment, 'REJECTED')}>Reject transaction</Button>
                                  <Button type="button" size="sm" variant="outline" aria-busy={updatingId === selected.id && updatingPaymentStatus === 'PENDING'} disabled={updatingId === selected.id || payment.status === 'PENDING'} onClick={() => void changePaymentStatus(selected, payment, 'PENDING')}>Reset to pending</Button>
                                </div>}
                                <div className="mt-3 text-sm text-muted-foreground">
                                  Linked people: {(payment.allocations || []).map((person) => `${person.name} (₹${Number(person.amount).toLocaleString('en-IN')})`).join(', ') || 'Allocation details unavailable'}
                                </div>
                              </section>
                            ))}
                            {(!selected.payments || selected.payments.length === 0) && <p className="text-sm text-muted-foreground">No transaction ledger details returned.</p>}
                          </div>
              
                          <h3 className="mt-8 text-xl font-semibold">
                            Participant Details
                          </h3>
              
                          <div className="mt-4 space-y-6">
              
                            {selected.participants?.map(participant => (
              
                              <div
                                key={participant.id}
                                className="rounded-lg border p-5"
                              >
              
                                <div className="mb-4 text-lg font-semibold">
                                  Participant {participant.participant_no}
                                  {' — '}
                                  {participant.name.toUpperCase()}
                                </div>
                                <div className="mb-4">
                                  <Button type="button" variant="outline" onClick={() => beginParticipantEdit(participant)}>
                                    Edit Participant / जानकारी सुधारें
                                  </Button>
                                </div>
                                <div className="mb-4">
                                  <Button type="button" variant="outline" aria-busy={participantAuditLoading && participantAuditId === participant.id} disabled={participantAuditLoading} onClick={() => void loadParticipantAudit(participant)}>
                                    {participantAuditLoading && participantAuditId === participant.id ? 'Loading audit…' : 'Correction Audit History'}
                                  </Button>
                                  {participantAuditId === participant.id && (
                                    <div className="mt-3 space-y-2 rounded-lg border p-3">
                                      {participantAudit.length === 0 ? <p className="text-sm text-muted-foreground">No correction audit entries found.</p> : participantAudit.map((entry, index) => (
                                        <div key={`${participant.id}-audit-${index}`} className="border-b pb-2 last:border-0">
                                          <p className="text-sm font-semibold">{entry.action} · {new Date(entry.created_at).toLocaleString('en-IN')}</p>
                                          <p className="text-sm">Reason: {entry.reason}</p>
                                          {entry.privacy_request_id && <p className="text-xs text-muted-foreground">Privacy request: {entry.privacy_request_id}</p>}
                                          <details className="mt-1 text-xs">
                                            <summary className="cursor-pointer">Changed fields (before / after)</summary>
                                            <div className="mt-2 space-y-2">
                                              {(() => {
                                                const parseSnapshot = (raw: string) => {
                                                  try {
                                                    const value = JSON.parse(raw || '{}')
                                                    return value && typeof value === 'object' && !Array.isArray(value)
                                                      ? value as Record<string, unknown>
                                                      : {}
                                                  } catch {
                                                    return {}
                                                  }
                                                }
                                                const before = parseSnapshot(entry.old_values_json)
                                                const after = parseSnapshot(entry.new_values_json)
                                                if (before.redacted === true || after.redacted === true) {
                                                  return <p className="rounded-md bg-muted p-3 text-muted-foreground">Personal data values have been redacted under the privacy-deletion process. Audit event and timestamp are retained.</p>
                                                }
                                                const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
                                                if (!fields.length) return <p className="text-muted-foreground">No field-level details are available.</p>
                                                const displayValue = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value)
                                                return fields.map(field => (
                                                  <div key={field} className="grid gap-1 rounded-md border p-2 sm:grid-cols-3">
                                                    <span className="font-semibold">{field.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())}</span>
                                                    <span><span className="text-muted-foreground">Before: </span>{displayValue(before[field])}</span>
                                                    <span><span className="text-muted-foreground">After: </span>{displayValue(after[field])}</span>
                                                  </div>
                                                ))
                                              })()}
                                            </div>
                                          </details>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {editingParticipantId === participant.id && (
                                  <div className="mb-5 space-y-3 rounded-lg border border-primary/40 bg-muted/30 p-4">
                                    <h3 className="font-semibold">Correct participant data</h3>
                                    <p className="text-xs text-muted-foreground">पहचान सत्यापित करने और सही जानकारी की पुष्टि के बाद ही बदलाव सेव करें। DOB बदलने पर आयु दोबारा निकाली जाएगी; 18 वर्ष से कम आयु का रिकॉर्ड इस registration policy के अनुसार सेव नहीं होगा।</p>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      {([
                                        ['name', 'Name'],
                                        ['dob', 'Date of birth'],
                                        ['gender', 'Gender'],
                                        ['district', 'District'],
                                        ['state', 'State'],
                                        ['pin', 'PIN'],
                                        ['address', 'Address'],
                                      ] as const).map(([field, label]) => (
                                        <label key={field} className={field === 'address' ? 'space-y-1 text-sm sm:col-span-2' : 'space-y-1 text-sm'}>
                                          <span className="font-medium">{label}</span>
                                          {field === 'address' ? (
                                            <textarea className="w-full rounded-lg border bg-background px-3 py-2" maxLength={500} value={participantDraft[field]} onChange={event => setParticipantDraft(current => ({ ...current, [field]: event.target.value }))} />
                                          ) : (
                                            <Input type={field === 'dob' ? 'date' : 'text'} maxLength={field === 'name' ? 150 : field === 'pin' ? 10 : 100} value={participantDraft[field]} onChange={event => setParticipantDraft(current => ({ ...current, [field]: event.target.value }))} />
                                          )}
                                        </label>
                                      ))}
                                    </div>
                                    <label className="block space-y-1 text-sm font-medium">Reason for correction (required)
                                      <textarea className="w-full rounded-lg border bg-background px-3 py-2 font-normal" maxLength={500} minLength={5} value={participantDraft.reason} onChange={event => setParticipantDraft(current => ({ ...current, reason: event.target.value }))} placeholder="e.g. Verified correction requested by participant" required />
                                    </label>
                                    {participantDraft.privacyRequestId && <p className="text-xs text-muted-foreground">Linked privacy request: {participantDraft.privacyRequestId}</p>}
                                    <div className="flex flex-wrap gap-2">
                                      <Button type="button" aria-busy={participantSaving} disabled={participantSaving} onClick={() => void saveParticipantCorrection(participant)}>{participantSaving ? 'Saving…' : 'Save correction'}</Button>
                                      <Button type="button" variant="outline" disabled={participantSaving} onClick={() => setEditingParticipantId(null)}>Cancel</Button>
                                    </div>
                                  </div>
                                )}
              
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              
                                  <div>
                                    <strong>Name</strong>
                                    <div>{participant.name || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Date of Birth</strong>
                                    <div>{participant.dob || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Age</strong>
                                    <div>{participant.age || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Gender</strong>
                                    <div>{participant.gender || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Category</strong>
                                    <div>{participant.category || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Fee</strong>
                                    <div>
                                      ₹{Number(
                                        participant.fee || 0
                                      ).toLocaleString('en-IN')}
                                    </div>
                                  </div>
              
                                  <div>
                                    <strong>District</strong>
                                    <div>{participant.district || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>State</strong>
                                    <div>{participant.state || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>PIN</strong>
                                    <div>{participant.pin || '—'}</div>
                                  </div>
              
                                  <div className="md:col-span-2">
                                    <strong>Address</strong>
                                    <div>{participant.address || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Activities</strong>
                                    <div className="whitespace-pre-line">
                                      {activities(
                                        participant.activities_json
                                      )}
                                    </div>
                                  </div>
              
                                  <div>
                                    <strong>Cultural</strong>
                                    <div>{participant.cultural || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Sports</strong>
                                    <div>{participant.sports || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>From Outside</strong>
                                    <div>{participant.from_outside || '—'}</div>
                                  </div>
              
                                  <div>
                                    <strong>Accommodation</strong>
                                    <div>{participant.accommodation || '—'}</div>
                                  </div>
              
                                </div>
              
                              </div>
                            ))}
              
                          </div>
              
                        </div>
                      )}
            </td>
          </tr>
        )}
        </>
        ))
      )}
    </tbody>

  </table>
</div>


      </>
    )}

      </div>
     <DeveloperCredit />
    </main>
  )
}