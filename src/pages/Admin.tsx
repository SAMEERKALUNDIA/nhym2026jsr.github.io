import { DeveloperCredit } from '@/components/DeveloperCredit'
import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'

async function registerWarangCitiFont(pdf: jsPDF) {
  try {
    const response = await fetch('/NotoSansWarangCiti-Regular.ttf')
    if (!response.ok) throw new Error('Warang Citi font could not be loaded.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    pdf.addFileToVFS('NotoSansWarangCiti-Regular.ttf', btoa(binary))
    pdf.addFont('NotoSansWarangCiti-Regular.ttf', 'WarangCiti', 'normal')
    return true
  } catch (error) {
    console.error('Unable to register Warang Citi font:', error)
    return false
  }
}

async function createWarangCitiTextImage(text: string): Promise<string | null> {
  try {
    const response = await fetch('/NotoSansWarangCiti-Regular.ttf')
    if (!response.ok) throw new Error('Warang Citi font file not found')
    const fontBytes = await response.arrayBuffer()
    const fontBlob = new Blob([fontBytes], { type: 'font/ttf' })
    const fontUrl = URL.createObjectURL(fontBlob)
    const fontFace = new FontFace('NHYMWarangCiti', `url(${fontUrl})`)
    await fontFace.load()
    document.fonts.add(fontFace)

    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 110
    const context = canvas.getContext('2d')
    if (!context) return null
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#1e412a'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '64px NHYMWarangCiti'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
    URL.revokeObjectURL(fontUrl)
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('Unable to render Warang Citi header:', error)
    return null
  }
}

async function loadPdfImage(path: string): Promise<string | null> {
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
  } catch (error) {
    console.error('Unable to load PDF image:', path, error)
    return null
  }
}

function addContainedPdfImage(pdf: jsPDF, data: string | null, x: number, y: number, maxWidth: number, maxHeight: number) {
  if (!data) return
  const props = pdf.getImageProperties(data)
  const scale = Math.min(maxWidth / props.width, maxHeight / props.height)
  const width = props.width * scale
  const height = props.height * scale
  pdf.addImage(data, 'JPEG', x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height)
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
  note: string
  details_json: string
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
}

export default function Admin() {
  const adminPath = window.location.pathname
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
  const [homeSectionsLoading, setHomeSectionsLoading] = useState(false)
  const [homeSectionsSaving, setHomeSectionsSaving] = useState(false)
  const [feedbackDeleting, setFeedbackDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
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
    } finally { setRegistrationControlSaving(false) }
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

    const j = await r.json() as {
      registrations?: Row[]
      error?: string
    }

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

      const j = await r.json() as {
        ok?: boolean
        status?: string
        emailSent?: boolean
        error?: string
      }

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

async function exportRegistrationsPdf() {
  if (filteredRows.length === 0) {
    window.alert('There are no registrations to export.')
    return
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  await registerWarangCitiFont(pdf)
  const warangCitiHeaderImage = await createWarangCitiTextImage('𑢴𑢢𑢴𑢣𑢶 𑢹𑢩𑢩 𑢮𑢣𑢡𑢳 𑢮𑢣𑢶𑢣𑢼 : 𑢽𑢢𑢼𑢮𑢩𑢳')
  const hoSamajLogoData = await loadPdfImage('/ho-samaj-logo.jpg')

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const margin = 12
  const contentWidth = pageWidth - margin * 2

  let logoData: string | null = null

  try {
    const response = await fetch('/nhym-logo2.jpg')

    if (response.ok) {
      const blob = await response.blob()

      logoData = await new Promise<string>(
        (resolve, reject) => {
          const reader = new FileReader()

          reader.onloadend = () =>
            resolve(reader.result as string)

          reader.onerror = reject

          reader.readAsDataURL(blob)
        }
      )
    }
  } catch (error) {
    console.error(
      'Unable to load NHYM logo:',
      error
    )
  }

  const generatedAt =
    new Date().toLocaleString('en-IN')

  const columnWidths = [
    31, // Registration ID
    45, // Primary participant
    16, // Count
    25, // Amount
    28, // Payment
    35, // Reference
    32, // Status
    36, // Submitted
  ]

  const headers = [
    'Registration ID',
    'Primary Participant',
    'Count',
    'Amount',
    'Payment',
    'Reference',
    'Status',
    'Submitted',
  ]

  let y = 59

  function addPageHeader(continuation = false) {
    // Continuation pages have no header or logos; keep room for the table and footer.
    if (continuation) {
      y = 16
      return
    }

    // Compact centered header, matching the individual Admin Registration PDF.
    addContainedPdfImage(pdf, hoSamajLogoData, margin, 2, 20, 20)
    addContainedPdfImage(pdf, logoData, pageWidth - margin - 20, 2, 20, 20)

    // Ho script, English title and year are centered and use the same size.
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(23, 75, 53)
    if (warangCitiHeaderImage) {
      pdf.addImage(warangCitiHeaderImage, 'PNG', pageWidth / 2 - 42, 1.4, 84, 6.1)
    }
    pdf.text('NATIONAL HO YOUTH MEET : SIRJON', pageWidth / 2, 11, { align: 'center' })
    pdf.text('2026', pageWidth / 2, 16.5, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(72, 30, 20)
    pdf.text('Organized By : Adivasi Ho Samaj Yuva Mahasabha • Jamshedpur • 28–29 November 2026', pageWidth / 2, 22, { align: 'center', maxWidth: pageWidth - margin * 2 })

    // Pale-green rounded report title box, with a dark-green border and title.
    pdf.setFillColor(221, 239, 227)
    pdf.setDrawColor(23, 100, 63)
    pdf.setLineWidth(0.35)
    pdf.roundedRect(margin, 27.5, contentWidth, 8.5, 1.2, 1.2, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(23, 75, 53)
    pdf.text('Registration Summary Report', pageWidth / 2, 33, { align: 'center' })

    // Generated date/time is shown in the footer; omit duplicate metadata here.
    y = 42
  }

  function drawTableHeader() {
    const rowHeight = 9
    let x = margin

    pdf.setFillColor(221, 239, 227)

    pdf.rect(
      margin,
      y,
      contentWidth,
      rowHeight,
      'F'
    )

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(60)

    headers.forEach(
      (header, index) => {
        pdf.text(
          header,
          x + 2,
          y + 5.7
        )

        x += columnWidths[index]
      }
    )

    pdf.setDrawColor(205)

    pdf.line(
      margin,
      y + rowHeight,
      pageWidth - margin,
      y + rowHeight
    )

    y += rowHeight
  }

  function addNewPage() {
    pdf.addPage()
    // Continuation pages omit the event header; retain the table's column labels.
    y = 16
    drawTableHeader()
  }

  addPageHeader()
  // Keep the table below the report title and generated-at metadata.
  y = 48
  drawTableHeader()

  filteredRows.forEach(
    (row, rowIndex) => {
      const values = [
        row.registration_id || '—',

        row.participants?.[0]?.name ||
          '—',

        String(
          row.participant_count || 0
        ),

        `INR ${Number(
          row.total_amount || 0
        ).toLocaleString('en-IN')}`,

        row.payment_mode?.toUpperCase() || '—',

        row.payment_reference || '—',

        row.status
          ?.replace(/_/g, ' ') ||
          '—',

        new Date(
          row.created_at
        ).toLocaleString('en-IN'),
      ]

      const wrappedValues =
        values.map(
          (value, index) =>
            pdf.splitTextToSize(
              value,
              columnWidths[index] - 4
            )
        )

      const maxLines =
        Math.max(
          ...wrappedValues.map(
            value => value.length
          )
        )

      const rowHeight =
        Math.max(
          9,
          maxLines * 3.6 + 4
        )

      if (
        y + rowHeight >
        pageHeight - 30
      ) {
        addNewPage()
      }

      if (rowIndex % 2 === 1) {
        pdf.setFillColor(
          250,
          250,
          250
        )

        pdf.rect(
          margin,
          y,
          contentWidth,
          rowHeight,
          'F'
        )
      }

      let x = margin

      pdf.setFont(
        'helvetica',
        'normal'
      )

      pdf.setFontSize(7)
      pdf.setTextColor(30)

      wrappedValues.forEach(
        (value, index) => {
          pdf.text(
            value,
            x + 2,
            y + 5
          )

          x += columnWidths[index]
        }
      )

      pdf.setDrawColor(230)

      pdf.line(
        margin,
        y + rowHeight,
        pageWidth - margin,
        y + rowHeight
      )

      y += rowHeight
    }
  )

  // Summary
  const reportAmount =
    filteredRows.reduce(
      (sum, row) =>
        sum +
        Number(row.total_amount || 0),
      0
    )

  const reportParticipants =
    filteredRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.participant_count || 0
        ),
      0
    )

  if (y + 22 > pageHeight - 30) {
    addNewPage()
  }

  y += 3

  pdf.setFillColor(221, 239, 227)
  pdf.setDrawColor(23, 100, 63)
  pdf.setLineWidth(0.45)

  pdf.roundedRect(
    margin,
    y,
    contentWidth,
    14,
    1.5,
    1.5,
    'FD'
  )

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(23, 75, 53)

  pdf.text(
    `Total Registrations: ${filteredRows.length}`,
    margin + 4,
    y + 8.5
  )

  pdf.text(
    `Total Participants: ${reportParticipants}`,
    margin + 75,
    y + 8.5
  )

  pdf.text(
    `Total Amount: INR ${reportAmount.toLocaleString(
      'en-IN'
    )}`,
    margin + 155,
    y + 8.5
  )

  // Compact footer: generated timestamp left, page number right.
  const pageCount = pdf.getNumberOfPages()
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    pdf.setPage(pageNumber)
    pdf.setDrawColor(23, 100, 63)
    pdf.setLineWidth(0.35)
    pdf.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(75, 90, 80)
    pdf.text(
      'Adress: Adivasi Ho Samaj Bhawan,Golmuri, Jamshedpur-831003 | Email: nhym2026jsr@gmail.com | Phone: 9931333025,7870979751',
      pageWidth / 2,
      pageHeight - 9,
      { align: 'center', maxWidth: pageWidth - margin * 2 }
    )
    pdf.text(`Generated: ${generatedAt}`, margin, pageHeight - 3.5)
    pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 3.5, { align: 'right' })
  }

  const date =
    new Date()
      .toISOString()
      .slice(0, 10)

  pdf.save(
    `NHYM-2026-Registrations-${date}.pdf`
  )
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
    'Note',
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
      participant.note,
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
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await registerWarangCitiFont(pdf)
  const warangCitiHeaderImage = await createWarangCitiTextImage('𑢴𑢢𑢴𑢣𑢶 𑢹𑢩𑢩 𑢮𑢣𑢡𑢳 𑢮𑢣𑢶𑢣𑢼 : 𑢽𑢢𑢼𑢮𑢩𑢳')
  const hoSamajLogoData = await loadPdfImage('/ho-samaj-logo.jpg')
  const logoData = await loadPdfImage('/nhym-logo2.jpg')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  const forest: [number, number, number] = [23, 75, 53]
  const border: [number, number, number] = [183, 208, 191]
  const pale: [number, number, number] = [245, 250, 246]
  const green: [number, number, number] = [221, 239, 227]
  let y = 41

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

  function addHeader(continuation = false) {
    addContainedPdfImage(pdf, hoSamajLogoData, margin, 3, 20, 20)
    addContainedPdfImage(pdf, logoData, pageWidth - margin - 20, 3, 20, 20)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...forest)
    if (warangCitiHeaderImage && !continuation) pdf.addImage(warangCitiHeaderImage, 'PNG', pageWidth / 2 - 48, 1.5, 96, 5.8)
    pdf.setFontSize(9.5)
    pdf.text('NATIONAL HO YOUTH MEET : SIRJON', pageWidth / 2, 9.5, { align: 'center' })
    pdf.setFontSize(9.5)
    pdf.text('2026', pageWidth / 2, 13.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.8)
    pdf.setTextColor(72, 30, 20)
    pdf.text('Organized By : Adivasi Ho Samaj Yuva Mahasabha • Jamshedpur • 28–29 November 2026', pageWidth / 2, 18, { align: 'center', maxWidth: contentWidth - 44 })
    pdf.setFillColor(...green)
    pdf.setDrawColor(...forest)
    pdf.roundedRect(margin, 25, contentWidth, 7, 1.2, 1.2, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...forest)
    pdf.text(continuation ? 'ADMIN REGISTRATION RECORD • ' + row.registration_id : 'ADMIN REGISTRATION RECORD', pageWidth / 2, 29.5, { align: 'center' })
    pdf.setDrawColor(...border)
    pdf.line(margin, 34, pageWidth - margin, 34)
    y = 39
  }

  function addFooter() {
    const pages = pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page)
      pdf.setDrawColor(...border)
      pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.2)
      pdf.setTextColor(82, 103, 90)
      pdf.text('Adress: Adivasi Ho Samaj Bhawan,Golmuri, Jamshedpur-831003 | Email: nhym2026jsr@gmail.com | Phone: 9931333025,7870979751', pageWidth / 2, pageHeight - 9.5, { align: 'center', maxWidth: pageWidth - margin * 2 })
      const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })
      pdf.text('Generated: ' + generatedAt + ' IST', margin, pageHeight - 4, { align: 'left' })
      pdf.text('Page ' + page + ' of ' + pages, pageWidth - margin, pageHeight - 4, { align: 'right' })
    }
  }

  function ensureSpace(height: number) {
    if (y + height > pageHeight - 24) {
      pdf.addPage()
      // The full event header belongs on page one only.
      y = 16
    }
  }

  function section(title: string) {
    ensureSpace(12)
    pdf.setFillColor(...green)
    pdf.setDrawColor(...forest)
    pdf.roundedRect(margin, y, contentWidth, 8, 1, 1, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...forest)
    pdf.text(title.toUpperCase(), margin + 3, y + 5.2)
    y += 10
  }

  function drawCell(label: string, value: string, x: number, width: number, height: number, fill: [number, number, number], fixedLabelWidth?: number) {
    pdf.setFillColor(...fill)
    pdf.setDrawColor(...border)
    pdf.rect(x, y, width, height, 'FD')
    const labelWidth = fixedLabelWidth ?? Math.min(31, Math.max(21, width * 0.35))
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.2)
    pdf.setTextColor(...forest)
    pdf.text(pdf.splitTextToSize(label.toUpperCase(), labelWidth - 3), x + 2, y + 4.1)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.7)
    pdf.setTextColor(29, 44, 35)
    pdf.text(pdf.splitTextToSize(value || '—', width - labelWidth - 4), x + labelWidth, y + 4.1)
  }

  function pair(label1: string, value1: string, label2: string, value2: string) {
    const gap = 3
    const cellWidth = (contentWidth - gap) / 2
    const labelWidth = Math.min(31, Math.max(21, cellWidth * 0.35))
    const values1 = pdf.splitTextToSize(value1 || '—', cellWidth - labelWidth - 4)
    const values2 = pdf.splitTextToSize(value2 || '—', cellWidth - labelWidth - 4)
    const labels1 = pdf.splitTextToSize(label1.toUpperCase(), labelWidth - 3)
    const labels2 = pdf.splitTextToSize(label2.toUpperCase(), labelWidth - 3)
    const height = Math.max(9, Math.max(values1.length, values2.length, labels1.length, labels2.length) * 3.4 + 4)
    ensureSpace(height + 1)
    const fill: [number, number, number] = Math.floor(y) % 2 === 0 ? pale : [255, 255, 255]
    drawCell(label1, value1, margin, cellWidth, height, fill)
    drawCell(label2, value2, margin + cellWidth + gap, cellWidth, height, fill)
    y += height
  }

  function full(label: string, value: string) {
    const labelWidth = 34
    const lines = pdf.splitTextToSize(value || '—', contentWidth - labelWidth - 5)
    const labelLines = pdf.splitTextToSize(label.toUpperCase(), labelWidth - 4)
    const height = Math.max(9, Math.max(lines.length, labelLines.length) * 3.6 + 4)
    ensureSpace(height + 1)
    drawCell(label, value, margin, contentWidth, height, pale, 34)
    y += height
  }

  addHeader()
  section('Registration Details')
  pair('Registration ID', row.registration_id, 'Status', row.status.replace(/_/g, ' '))
  pair('Registered Email', row.email || '—', 'Total Amount', 'INR ' + Number(row.total_amount || 0).toLocaleString('en-IN'))
  pair('Payment Method', row.payment_mode?.toUpperCase() || '—', 'Payment Reference', row.payment_reference || '—')
  pair('Submitted', new Date(row.created_at).toLocaleString('en-IN'), 'Approval Email', row.approval_email_sent_at ? 'Sent: ' + new Date(row.approval_email_sent_at).toLocaleString('en-IN') : 'Not sent')

  ;(row.participants || []).forEach((p, index) => {
    y += 4
    section('Participant ' + p.participant_no + ' Details')
    full('Participant Name', (p.name || '—').toUpperCase())
    pair('Category', categoryLabel(p.category), 'Participant Fee', 'INR ' + Number(p.fee || 0).toLocaleString('en-IN'))
    pair('Date of Birth', p.dob || '—', 'Age', p.age || '—')
    pair('Gender', p.gender || '—', 'PIN', p.pin || '—')
    pair('District', p.district || '—', 'State', p.state || '—')
    full('Address', p.address || '—')
    pair('Accommodation Required', yesNo(p.accommodation), 'From Outside Jamshedpur', yesNo(p.from_outside))
    pair('Cultural', p.cultural || '—', 'Sports', p.sports || '—')
    full('Activities', activities(p.activities_json))
    if (p.note) full('Note', p.note)
    if (index < (row.participants || []).length - 1) y += 3
  })

  addFooter()
  pdf.save(row.registration_id + '-Admin-Registration.pdf')
}
async function exportParticipantsPdf() {
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

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  await registerWarangCitiFont(pdf)
  const warangCitiHeaderImage = await createWarangCitiTextImage('𑢴𑢢𑢴𑢣𑢶 𑢹𑢩𑢩 𑢮𑢣𑢡𑢳 𑢮𑢣𑢶𑢣𑢼 : 𑢽𑢢𑢼𑢮𑢩𑢳')
  const hoSamajLogoData = await loadPdfImage('/ho-samaj-logo.jpg')

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const margin = 10
  const contentWidth = pageWidth - margin * 2

  let logoData: string | null = null

  try {
    const response = await fetch('/nhym-logo2.jpg')

    if (response.ok) {
      const blob = await response.blob()

      logoData = await new Promise<string>(
        (resolve, reject) => {
          const reader = new FileReader()

          reader.onloadend = () =>
            resolve(reader.result as string)

          reader.onerror = reject
          reader.readAsDataURL(blob)
        }
      )
    }
  } catch (error) {
    console.error(
      'Unable to load NHYM logo:',
      error
    )
  }

  const generatedAt =
    new Date().toLocaleString('en-IN')

  /*
   * Compact participant summary.
   * Detailed information remains available in
   * the individual Admin Registration PDF.
   */
  const headers = [
    'Reg. ID',
    'No.',
    'Participant Name',
    'Category',
    'Gender',
    'Age',
    'District',
    'State',
    'Fee',
    'Accommodation',
    'Status',
  ]

  const columnWidths = [
    29, // Registration ID
    10, // Participant number
    39, // Name
    35, // Category
    18, // Gender
    12, // Age
    31, // District
    25, // State
    22, // Fee
    28, // Accommodation
    28, // Status
  ]

  let y = 47

  function categoryLabel(category: string) {
    switch (category) {
      case 'student':
        return 'Student Participant'

      case 'non-earning':
      case 'non_earning':
        return 'Non-Earning Participant'

      case 'earning':
        return 'Earning Participant'

      case 'visitor':
        return 'Audience / Visitor'

      default:
        return category || '—'
    }
  }

  function yesNo(value: string) {
    switch (value?.toLowerCase()) {
      case 'yes':
        return 'Yes'

      case 'no':
        return 'No'

      case 'maybe':
        return 'Maybe'

      default:
        return value || '—'
    }
  }

  function addPageHeader(continuation = false) {
    // Continuation pages have no header or logos; keep room for the table and footer.
    if (continuation) {
      y = 16
      return
    }

    // Compact centered header, matching the individual Admin Registration PDF.
    addContainedPdfImage(pdf, hoSamajLogoData, margin, 2, 20, 20)
    addContainedPdfImage(pdf, logoData, pageWidth - margin - 20, 2, 20, 20)

    // Ho script, English title and year are centered and use the same size.
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(23, 75, 53)
    if (warangCitiHeaderImage) {
      pdf.addImage(warangCitiHeaderImage, 'PNG', pageWidth / 2 - 42, 1.4, 84, 6.1)
    }
    pdf.text('NATIONAL HO YOUTH MEET : SIRJON', pageWidth / 2, 11, { align: 'center' })
    pdf.text('2026', pageWidth / 2, 16.5, { align: 'center' })

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(72, 30, 20)
    pdf.text('Organized By : Adivasi Ho Samaj Yuva Mahasabha • Jamshedpur • 28–29 November 2026', pageWidth / 2, 22, { align: 'center', maxWidth: pageWidth - margin * 2 })

    // Pale-green rounded report title box, with a dark-green border and title.
    pdf.setFillColor(221, 239, 227)
    pdf.setDrawColor(23, 100, 63)
    pdf.setLineWidth(0.35)
    pdf.roundedRect(margin, 27.5, contentWidth, 8.5, 1.2, 1.2, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(23, 75, 53)
    pdf.text('Participant Summary Report', pageWidth / 2, 33, { align: 'center' })

    // Generated date/time is shown in the footer; omit duplicate metadata here.
    y = 42
  }

  function drawTableHeader() {
    const rowHeight = 9
    let x = margin

    pdf.setFillColor(221, 239, 227)

    pdf.rect(
      margin,
      y,
      contentWidth,
      rowHeight,
      'F'
    )

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(60)

    headers.forEach((header, index) => {
      pdf.text(
        header,
        x + 1.5,
        y + 5.7
      )

      x += columnWidths[index]
    })

    pdf.setDrawColor(205)

    pdf.line(
      margin,
      y + rowHeight,
      pageWidth - margin,
      y + rowHeight
    )

    y += rowHeight
  }

  function addNewPage() {
    pdf.addPage()
    // Continuation pages show table headings only, not the event header.
    y = 16
    drawTableHeader()
  }

  addPageHeader()
  // Keep the table below the report title and generated-at metadata.
  y = 48
  drawTableHeader()

  participantRows.forEach(
    ({ registration, participant }, rowIndex) => {
      const values = [
        registration.registration_id || '—',

        String(
          participant.participant_no || '—'
        ),

        participant.name || '—',

        categoryLabel(
          participant.category
        ),

        participant.gender
          ? participant.gender.charAt(0).toUpperCase() +
            participant.gender.slice(1).toLowerCase()
          : '—',

        participant.age || '—',

        participant.district || '—',

        participant.state || '—',

        `INR ${Number(
          participant.fee || 0
        ).toLocaleString('en-IN')}`,

        yesNo(
          participant.accommodation
        ),

        registration.status
          ?.replace(/_/g, ' ') ||
          '—',
      ]

      const wrappedValues =
        values.map((value, index) =>
          pdf.splitTextToSize(
            value,
            columnWidths[index] - 3
          )
        )

      const maxLines = Math.max(
        ...wrappedValues.map(
          value => value.length
        )
      )

      const rowHeight = Math.max(
        9,
        maxLines * 3.5 + 4
      )

      if (
        y + rowHeight >
        pageHeight - 19
      ) {
        addNewPage()
      }

      if (rowIndex % 2 === 1) {
        pdf.setFillColor(
          250,
          250,
          250
        )

        pdf.rect(
          margin,
          y,
          contentWidth,
          rowHeight,
          'F'
        )
      }

      let x = margin

      pdf.setFont(
        'helvetica',
        'normal'
      )

      pdf.setFontSize(6.5)
      pdf.setTextColor(30)

      wrappedValues.forEach(
        (value, index) => {
          pdf.text(
            value,
            x + 1.5,
            y + 5
          )

          x += columnWidths[index]
        }
      )

      pdf.setDrawColor(230)

      pdf.line(
        margin,
        y + rowHeight,
        pageWidth - margin,
        y + rowHeight
      )

      y += rowHeight
    }
  )

  const totalFees =
    participantRows.reduce(
      (sum, item) =>
        sum +
        Number(
          item.participant.fee || 0
        ),
      0
    )

  if (y + 22 > pageHeight - 19) {
    addNewPage()
  }

  y += 3

  pdf.setFillColor(221, 239, 227)
  pdf.setDrawColor(23, 100, 63)
  pdf.setLineWidth(0.45)

  pdf.roundedRect(
    margin,
    y,
    contentWidth,
    14,
    1.5,
    1.5,
    'FD'
  )

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(23, 75, 53)

  pdf.text(
    `Total Participants: ${participantRows.length}`,
    margin + 4,
    y + 8.5
  )

  pdf.text(
    `Registrations: ${filteredRows.length}`,
    margin + 90,
    y + 8.5
  )

  pdf.text(
    `Total Participant Fees: INR ${totalFees.toLocaleString(
      'en-IN'
    )}`,
    margin + 165,
    y + 8.5
  )

  // Compact footer: generated timestamp left, page number right.
  const pageCount = pdf.getNumberOfPages()
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    pdf.setPage(pageNumber)
    pdf.setDrawColor(23, 100, 63)
    pdf.setLineWidth(0.35)
    pdf.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(75, 90, 80)
    pdf.text(
      'Adress: Adivasi Ho Samaj Bhawan,Golmuri, Jamshedpur-831003 | Email: nhym2026jsr@gmail.com | Phone: 9931333025,7870979751',
      pageWidth / 2,
      pageHeight - 9,
      { align: 'center', maxWidth: pageWidth - margin * 2 }
    )
    pdf.text(`Generated: ${generatedAt}`, margin, pageHeight - 3.5)
    pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 3.5, { align: 'right' })
  }

  const date =
    new Date()
      .toISOString()
      .slice(0, 10)

  pdf.save(
    `NHYM-2026-Participants-${date}.pdf`
  )
}
  function activities(value: string) {
    try {
      const parsed = JSON.parse(value || '[]')

      if (Array.isArray(parsed)) {
        return parsed.join(', ') || '—'
      }

      return String(parsed || '—')
    } catch {
      return value || '—'
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

    if (row.status === 'PENDING') {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'PAYMENT_VERIFIED')
            }
          >
            {busy ? 'Updating…' : 'Verify Payment'}
          </Button>

          <Button
            variant="outline"
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
            disabled={busy}
            onClick={() =>
              changeStatus(row, 'APPROVED')
            }
          >
            {busy ? 'Updating…' : 'Approve Registration'}
          </Button>

          <Button
            variant="outline"
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
    <main className="grid min-h-dvh place-items-center bg-background px-gutter py-10">
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
    <main className="min-h-dvh bg-background px-gutter py-10">
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
        onClick={() => { window.location.href = '/admin/gallery' }}
        className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40"
      >
        <div className="text-xl font-semibold">Manage Gallery →</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload, review and delete NHYM gallery photos and monitor storage usage.
        </p>
      </button>

      <button type="button" onClick={() => { window.location.href = '/admin/homepage-sections' }} className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40">
        <div className="text-xl font-semibold">Homepage Section Visibility →</div>
        <p className="mt-2 text-sm text-muted-foreground">महत्वपूर्ण सूचना और लोगों की प्रतिक्रियाओं को होम पेज पर दिखाएँ या छिपाएँ।</p>
      </button>

      <button type="button" onClick={() => { window.location.href = '/admin/feedback' }} className="rounded-xl border bg-card p-6 text-left transition hover:bg-muted/40">
        <div className="text-xl font-semibold">Manage Feedback →</div>
        <p className="mt-2 text-sm text-muted-foreground">सार्वजनिक प्रतिक्रियाएँ देखें और एक या कई प्रतिक्रियाएँ चुनकर हटाएँ।</p>
      </button>

      <button
        type="button"
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
        <Button type="button" variant="outline" disabled={adminFinanceLoading} onClick={() => showAdminFinanceUsers ? setShowAdminFinanceUsers(false) : void loadAdminFinanceUsers()}>
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
                  <Button type="button" disabled={registrationControlLoading || registrationControlSaving || registrationOpen} onClick={() => void saveRegistrationStatus(true)}>Registration चालू करें</Button>
                  <Button type="button" variant="destructive" disabled={registrationControlLoading || registrationControlSaving || !registrationOpen} onClick={() => {
                    if (window.confirm('क्या आप नया registration बंद करना चाहते हैं? पहले से दर्ज सभी रिकॉर्ड सुरक्षित रहेंगे।')) void saveRegistrationStatus(false)
                  }}>Registration बंद करें</Button>
                  <Button type="button" variant="outline" disabled={registrationControlLoading || registrationControlSaving} onClick={() => void loadRegistrationStatus()}>रीफ़्रेश</Button>
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
        ))
      )}
    </tbody>

  </table>
</div>

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
                    <Button type="button" variant="outline" disabled={participantAuditLoading} onClick={() => void loadParticipantAudit(participant)}>
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
                                      <span className="font-semibold">{field.replace(/_/g, ' ').replace(/\\b\\w/g, letter => letter.toUpperCase())}</span>
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
                        <Button type="button" disabled={participantSaving} onClick={() => void saveParticipantCorrection(participant)}>{participantSaving ? 'Saving…' : 'Save correction'}</Button>
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
                      <div>
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

                    <div className="md:col-span-2">
                      <strong>Note</strong>
                      <div>{participant.note || '—'}</div>
                    </div>

                  </div>

                </div>
              ))}

            </div>

          </div>
        )}
      </>
    )}

      </div>
     <DeveloperCredit />
    </main>
  )
}