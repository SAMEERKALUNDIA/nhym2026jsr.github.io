import { DeveloperCredit } from '@/components/DeveloperCredit'
import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
const [loginToken, setLoginToken] = useState('')
const [authenticated, setAuthenticated] = useState(false)
const [checkingSession, setCheckingSession] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)

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

async function login(event: React.FormEvent) {
  event.preventDefault()

  const enteredToken = loginToken.trim()

  if (!enteredToken) {
    setError('Enter the admin password / access key.')
    return
  }

  setError('')
  setSuccess('')

  const ok = await load(enteredToken)

  if (!ok) return

  sessionStorage.setItem(
    'nhym_admin_token',
    enteredToken
  )

  setToken(enteredToken)
  setLoginToken('')
  setAuthenticated(true)
}

function logout() {
  sessionStorage.removeItem('nhym_admin_token')

  setToken('')
  setLoginToken('')
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

  if (isGalleryPage) {
    void loadGalleryPhotos()
    void loadGalleryStorage()
    return
  }

  if (!isParticipantPage) {
    void loadGalleryStorage()
  }
}, [authenticated, token, isGalleryPage, isParticipantPage])

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

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const margin = 12
  const contentWidth = pageWidth - margin * 2

  let logoData: string | null = null

  try {
    const response = await fetch('/nhym-logo.jpeg')

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

  let y = 43

  function addPageHeader(
    continuation = false
  ) {
    if (logoData) {
      pdf.addImage(
        logoData,
        'JPEG',
        margin,
        7,
        continuation ? 17 : 24,
        continuation ? 17 : 24
      )
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(72, 30, 20)

    pdf.setFontSize(
      continuation ? 13 : 17
    )

    pdf.text(
      'NATIONAL HO YOUTH MEET 2026',
      logoData
        ? continuation
          ? 34
          : 42
        : margin,
      continuation ? 14 : 15
    )

    pdf.setFont(
      'helvetica',
      continuation ? 'normal' : 'bold'
    )

    pdf.setFontSize(
      continuation ? 8 : 11
    )

    pdf.setTextColor(50)

    pdf.text(
      continuation
        ? 'Registration Summary Report - Continued'
        : 'Registration Summary Report',
      logoData
        ? continuation
          ? 34
          : 42
        : margin,
      continuation ? 20 : 22
    )

    if (!continuation) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(100)

      pdf.text(
        'Jamshedpur, Jharkhand',
        42,
        28
      )

      pdf.text(
        `Generated: ${generatedAt}`,
        pageWidth - margin,
        15,
        { align: 'right' }
      )

      pdf.text(
        `Registrations in report: ${filteredRows.length}`,
        pageWidth - margin,
        21,
        { align: 'right' }
      )

      const participantTotal =
        filteredRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.participant_count || 0
            ),
          0
        )

      pdf.text(
        `Participants: ${participantTotal}`,
        pageWidth - margin,
        27,
        { align: 'right' }
      )
    }

    pdf.setDrawColor(185)

    pdf.line(
      margin,
      continuation ? 28 : 34,
      pageWidth - margin,
      continuation ? 28 : 34
    )

    y = continuation ? 34 : 40
  }

  function drawTableHeader() {
    const rowHeight = 9
    let x = margin

    pdf.setFillColor(245, 241, 234)

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
    addPageHeader(true)
    drawTableHeader()
  }

  addPageHeader()
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

  if (y + 22 > pageHeight - 19) {
    addNewPage()
  }

  y += 6

  pdf.setFillColor(245, 241, 234)

  pdf.roundedRect(
    margin,
    y,
    contentWidth,
    14,
    1.5,
    1.5,
    'F'
  )

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(50)

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

  // Footer on every page
  const pageCount =
    pdf.getNumberOfPages()

  for (
    let pageNumber = 1;
    pageNumber <= pageCount;
    pageNumber++
  ) {
    pdf.setPage(pageNumber)

    pdf.setDrawColor(210)

    pdf.line(
      margin,
      pageHeight - 14,
      pageWidth - margin,
      pageHeight - 14
    )

    pdf.setFont(
      'helvetica',
      'normal'
    )

    pdf.setFontSize(7)
    pdf.setTextColor(110)

    pdf.text(
      'Confidential Admin Report - National Ho Youth Meet 2026',
      margin,
      pageHeight - 8
    )

    pdf.text(
      `Page ${pageNumber} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: 'right' }
    )
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
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2

  // Load NHYM logo
  let logoData: string | null = null

  try {
    const response = await fetch('/nhym-logo.jpeg')

    if (!response.ok) {
      throw new Error('Logo could not be loaded.')
    }

    const blob = await response.blob()

    logoData = await new Promise<string>(
      (resolve, reject) => {
        const reader = new FileReader()

        reader.onloadend = () => {
          resolve(reader.result as string)
        }

        reader.onerror = reject
        reader.readAsDataURL(blob)
      }
    )
  } catch (error) {
    console.error('Unable to load NHYM logo:', error)
  }

  let y = 48

  function addHeader(continuation = false) {
    if (logoData) {
      pdf.addImage(
        logoData,
        'JPEG',
        margin,
        8,
        continuation ? 18 : 28,
        continuation ? 18 : 28
      )
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(72, 30, 20)

    if (continuation) {
      pdf.setFontSize(13)

      pdf.text(
        'NATIONAL HO YOUTH MEET 2026',
        logoData ? 38 : margin,
        15
      )

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(100)

      pdf.text(
        `Registration ID: ${row.registration_id}`,
        logoData ? 38 : margin,
        21
      )

      pdf.setDrawColor(190)
      pdf.line(
        margin,
        30,
        pageWidth - margin,
        30
      )

      y = 38
      return
    }

    pdf.setFontSize(17)

    pdf.text(
      'NATIONAL HO YOUTH MEET 2026',
      48,
      17
    )

    pdf.setFontSize(12)
    pdf.setTextColor(40)

    pdf.text(
      'Admin Registration Record',
      48,
      24
    )

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(100)

    pdf.text(
      'Jamshedpur, Jharkhand',
      48,
      30
    )

    pdf.setDrawColor(180)

    pdf.line(
      margin,
      40,
      pageWidth - margin,
      40
    )
  }

  function addContinuationPage() {
    pdf.addPage()
    addHeader(true)
  }

  function ensureSpace(required: number) {
    if (y + required > pageHeight - 23) {
      addContinuationPage()
    }
  }

  function sectionTitle(title: string) {
    ensureSpace(15)

    pdf.setFillColor(245, 241, 234)

    pdf.roundedRect(
      margin,
      y - 5,
      contentWidth,
      9,
      1.5,
      1.5,
      'F'
    )

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(72, 30, 20)

    pdf.text(
      title,
      margin + 3,
      y + 1
    )

    y += 10
  }

  function field(
    label: string,
    value: string,
    x: number,
    width: number
  ) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(110)

    pdf.text(
      label.toUpperCase(),
      x,
      y
    )

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(25)

    const lines = pdf.splitTextToSize(
      value || '—',
      width
    )

    pdf.text(
      lines,
      x,
      y + 4
    )

    return Math.max(
      8,
      lines.length * 4 + 5
    )
  }

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

  const columnGap = 10
  const columnWidth =
    (contentWidth - columnGap) / 2

  const column1 = margin
  const column2 =
    margin + columnWidth + columnGap

  // First page header
  addHeader()

  // Registration details
  sectionTitle('Registration Details')

  let height1 = field(
    'Registration ID',
    row.registration_id,
    column1,
    columnWidth
  )

  let height2 = field(
    'Status',
    row.status.replace(/_/g, ' '),
    column2,
    columnWidth
  )

  y += Math.max(height1, height2)

  height1 = field(
    'Registered Email',
    row.email || '—',
    column1,
    columnWidth
  )

  height2 = field(
    'Total Amount',
    `INR ${Number(
      row.total_amount || 0
    ).toLocaleString('en-IN')}`,
    column2,
    columnWidth
  )

  y += Math.max(height1, height2)

  height1 = field(
    'Payment Method',
    row.payment_mode?.toUpperCase() || '—',
    column1,
    columnWidth
  )

  height2 = field(
    'Payment Reference',
    row.payment_reference || '—',
    column2,
    columnWidth
  )

  y += Math.max(height1, height2)

  height1 = field(
    'Submitted',
    new Date(row.created_at)
      .toLocaleString('en-IN'),
    column1,
    columnWidth
  )

  height2 = field(
    'Approval Email',
    row.approval_email_sent_at
      ? `Sent: ${new Date(
          row.approval_email_sent_at
        ).toLocaleString('en-IN')}`
      : 'Not sent',
    column2,
    columnWidth
  )

  y += Math.max(height1, height2) + 3

  // Participant details
  ;(row.participants || []).forEach(
    (participant, index) => {
      ensureSpace(85)

      sectionTitle(
        `Participant ${participant.participant_no} Details`
      )

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.setTextColor(25)

      const nameLines = pdf.splitTextToSize(
        participant.name || '—',
        contentWidth
      )

      pdf.text(
        nameLines,
        margin,
        y
      )

      y += nameLines.length * 5 + 4

      height1 = field(
        'Category',
        categoryLabel(participant.category),
        column1,
        columnWidth
      )

      height2 = field(
        'Participant Fee',
        `INR ${Number(
          participant.fee || 0
        ).toLocaleString('en-IN')}`,
        column2,
        columnWidth
      )

      y += Math.max(height1, height2)

      height1 = field(
        'Date of Birth',
        participant.dob || '—',
        column1,
        columnWidth
      )

      height2 = field(
        'Age',
        participant.age || '—',
        column2,
        columnWidth
      )

      y += Math.max(height1, height2)

      height1 = field(
        'Gender',
        participant.gender || '—',
        column1,
        columnWidth
      )

      height2 = field(
        'PIN',
        participant.pin || '—',
        column2,
        columnWidth
      )

      y += Math.max(height1, height2)

      height1 = field(
        'District',
        participant.district || '—',
        column1,
        columnWidth
      )

      height2 = field(
        'State',
        participant.state || '—',
        column2,
        columnWidth
      )

      y += Math.max(height1, height2)

      ensureSpace(18)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.setTextColor(110)

      pdf.text(
        'ADDRESS',
        margin,
        y
      )

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
      pdf.setTextColor(25)

      const addressLines =
        pdf.splitTextToSize(
          participant.address || '—',
          contentWidth
        )

      pdf.text(
        addressLines,
        margin,
        y + 4
      )

      y += addressLines.length * 4 + 7

      ensureSpace(18)

      height1 = field(
        'Accommodation Required',
        yesNo(participant.accommodation),
        column1,
        columnWidth
      )

      height2 = field(
        'From Outside Jamshedpur',
        yesNo(participant.from_outside),
        column2,
        columnWidth
      )

      y += Math.max(height1, height2)

      ensureSpace(18)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.setTextColor(110)

      pdf.text(
        'ACTIVITIES',
        margin,
        y
      )

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
      pdf.setTextColor(25)

      const activityLines =
        pdf.splitTextToSize(
          activities(
            participant.activities_json
          ),
          contentWidth
        )

      pdf.text(
        activityLines,
        margin,
        y + 4
      )

      y += activityLines.length * 4 + 7

      if (participant.cultural) {
        ensureSpace(14)

        height1 = field(
          'Cultural',
          participant.cultural,
          column1,
          columnWidth
        )

        height2 = field(
          'Sports',
          participant.sports || '—',
          column2,
          columnWidth
        )

        y += Math.max(height1, height2)
      }

      if (participant.note) {
        ensureSpace(18)

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(110)

        pdf.text(
          'NOTE',
          margin,
          y
        )

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8.5)
        pdf.setTextColor(25)

        const noteLines =
          pdf.splitTextToSize(
            participant.note,
            contentWidth
          )

        pdf.text(
          noteLines,
          margin,
          y + 4
        )

        y += noteLines.length * 4 + 7
      }

      if (
        index <
        (row.participants || []).length - 1
      ) {
        ensureSpace(10)

        pdf.setDrawColor(220)

        pdf.line(
          margin,
          y,
          pageWidth - margin,
          y
        )

        y += 7
      }
    }
  )

  // Footer on every page
  const pageCount =
    pdf.getNumberOfPages()

  for (
    let pageNumber = 1;
    pageNumber <= pageCount;
    pageNumber++
  ) {
    pdf.setPage(pageNumber)

    pdf.setDrawColor(210)

    pdf.line(
      margin,
      pageHeight - 18,
      pageWidth - margin,
      pageHeight - 18
    )

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(110)

    pdf.text(
      'Confidential Admin Record - National Ho Youth Meet 2026',
      margin,
      pageHeight - 12
    )

    pdf.text(
      `Page ${pageNumber} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 12,
      {
        align: 'right',
      }
    )
  }

  pdf.save(
    `${row.registration_id}-Admin-Registration.pdf`
  )
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

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const margin = 10
  const contentWidth = pageWidth - margin * 2

  let logoData: string | null = null

  try {
    const response = await fetch('/nhym-logo.jpeg')

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

  let y = 42

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

  function addPageHeader(
    continuation = false
  ) {
    if (logoData) {
      pdf.addImage(
        logoData,
        'JPEG',
        margin,
        6,
        continuation ? 17 : 24,
        continuation ? 17 : 24
      )
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(72, 30, 20)
    pdf.setFontSize(
      continuation ? 13 : 17
    )

    pdf.text(
      'NATIONAL HO YOUTH MEET 2026',
      logoData
        ? continuation
          ? 32
          : 40
        : margin,
      continuation ? 13 : 14
    )

    pdf.setFont(
      'helvetica',
      continuation ? 'normal' : 'bold'
    )

    pdf.setFontSize(
      continuation ? 8 : 11
    )

    pdf.setTextColor(50)

    pdf.text(
      continuation
        ? 'Participant Summary Report - Continued'
        : 'Participant Summary Report',
      logoData
        ? continuation
          ? 32
          : 40
        : margin,
      continuation ? 19 : 21
    )

    if (!continuation) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(100)

      pdf.text(
        'Jamshedpur, Jharkhand',
        40,
        27
      )

      pdf.text(
        `Generated: ${generatedAt}`,
        pageWidth - margin,
        14,
        { align: 'right' }
      )

      pdf.text(
        `Participants in report: ${participantRows.length}`,
        pageWidth - margin,
        20,
        { align: 'right' }
      )

      pdf.text(
        `Registrations represented: ${filteredRows.length}`,
        pageWidth - margin,
        26,
        { align: 'right' }
      )
    }

    pdf.setDrawColor(185)

    pdf.line(
      margin,
      continuation ? 27 : 33,
      pageWidth - margin,
      continuation ? 27 : 33
    )

    y = continuation ? 33 : 39
  }

  function drawTableHeader() {
    const rowHeight = 9
    let x = margin

    pdf.setFillColor(245, 241, 234)

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
    addPageHeader(true)
    drawTableHeader()
  }

  addPageHeader()
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

  y += 6

  pdf.setFillColor(245, 241, 234)

  pdf.roundedRect(
    margin,
    y,
    contentWidth,
    14,
    1.5,
    1.5,
    'F'
  )

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(50)

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

  // Footer on every page
  const pageCount =
    pdf.getNumberOfPages()

  for (
    let pageNumber = 1;
    pageNumber <= pageCount;
    pageNumber++
  ) {
    pdf.setPage(pageNumber)

    pdf.setDrawColor(210)

    pdf.line(
      margin,
      pageHeight - 14,
      pageWidth - margin,
      pageHeight - 14
    )

    pdf.setFont(
      'helvetica',
      'normal'
    )

    pdf.setFontSize(7)
    pdf.setTextColor(110)

    pdf.text(
      'Confidential Participant Report - National Ho Youth Meet 2026',
      margin,
      pageHeight - 8
    )

    pdf.text(
      `Page ${pageNumber} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: 'right' }
    )
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
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
            National Ho Youth Meet 2026
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Admin Login
          </h1>

          <p className="mt-3 text-muted-foreground">
            Registration administration for authorized
            organizers only.
          </p>
        </div>

        <form
          onSubmit={login}
          className="mt-8 rounded-xl border bg-card p-6 shadow-sm"
        >
          <label
            htmlFor="admin-password"
            className="text-sm font-medium"
          >
            Admin Password / Access Key
          </label>

          <Input
            id="admin-password"
            type="password"
            value={loginToken}
            onChange={e =>
              setLoginToken(e.target.value)
            }
            placeholder="Enter admin access key"
            autoComplete="current-password"
            autoFocus
            className="mt-2 h-12"
          />

          {error && (
            <div className="mt-4 rounded-lg border border-destructive p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !loginToken.trim()}
            className="mt-5 h-12 w-full"
          >
            {loading
              ? 'Signing in…'
              : 'Sign In'}
          </Button>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Authorized NHYM 2026 administration only.
          </p>
        </form>

        <div className="mt-5 text-center">
          <a
            href="/"
            className="text-sm underline underline-offset-4"
          >
            ← Back to NHYM website
          </a>
        </div>
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
      {isGalleryPage
        ? 'Gallery Management'
        : isParticipantPage
          ? 'Participant Management'
          : 'NHYM 2026 Admin Dashboard'}
    </h1>

    <p className="mt-2 text-muted-foreground">
      {isGalleryPage
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

{!isGalleryPage && !isParticipantPage && (
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

    <div className="mt-8 grid gap-4 md:grid-cols-2">
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
    </div>
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
      <Input
        value={galleryCategory}
        onChange={(event) => setGalleryCategory(event.target.value)}
        placeholder="NHYM Events"
      />
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
                      <Input
                        value={galleryEditCategory}
                        onChange={(event) => setGalleryEditCategory(event.target.value)}
                        placeholder="e.g. NHYM Events"
                        maxLength={100}
                      />
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