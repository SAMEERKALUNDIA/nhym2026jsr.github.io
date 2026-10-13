import { DeveloperCredit } from '@/components/DeveloperCredit'
import { useState } from 'react'
import { Link } from 'react-router'
import { jsPDF } from 'jspdf'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react'

import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

async function createWarangCitiTextImage(text: string): Promise<string | null> {
  try {
    const response = await fetch('/NotoSansWarangCiti-Regular.ttf')
    if (!response.ok) throw new Error('Warang Citi font file not found')
    const bytes = await response.arrayBuffer()
    const url = URL.createObjectURL(new Blob([bytes], { type: 'font/ttf' }))
    const face = new FontFace('NHYMWarangCiti', `url(${url})`)
    await face.load()
    document.fonts.add(face)
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
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('Unable to render Warang Citi header:', error)
    return null
  }
}

type ParticipantRecord = {
  participant_no: number
  name: string
  dob: string
  gender: string
  district: string
  state: string
  age: string
  category: string
  fee: number
  activities_json: string
  cultural: string
  sports: string
  from_outside: string
  accommodation: string
  note: string
}

type RegistrationRecord = {
  registrationId: string
  email: string
  totalAmount: number
  paymentMode: string
  status: string
  createdAt: string
  updatedAt: string | null
  approvalEmailSent: boolean
  participants: ParticipantRecord[]
}

function statusLabel(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'Approved'

    case 'PAYMENT_VERIFIED':
      return 'Payment Verified'

    case 'REJECTED':
      return 'Rejected'

    default:
      return 'Pending'
  }
}

function statusClasses(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'border-green-200 bg-green-50 text-green-800'

    case 'PAYMENT_VERIFIED':
      return 'border-blue-200 bg-blue-50 text-blue-800'

    case 'REJECTED':
      return 'border-red-200 bg-red-50 text-red-800'

    default:
      return 'border-amber-200 bg-amber-50 text-amber-800'
  }
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
      return '—'
  }
}

function activities(value: string) {
  try {
    const parsed = JSON.parse(value)

    if (Array.isArray(parsed)) {
      return parsed.join(', ')
    }
  } catch {
    // Ignore malformed historical data.
  }

  return value || '—'
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')

  if (!name || !domain) {
    return '—'
  }

  if (name.length <= 2) {
    return `${name.charAt(0)}***@${domain}`
  }

  return `${name.slice(0, 2)}${'*'.repeat(
    Math.min(name.length - 2, 12)
  )}@${domain}`
}

function formatDate(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('en-IN')
}

export default function Participant() {
  const [registrationId, setRegistrationId] = useState('')
  const [email, setEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [registration, setRegistration] =
    useState<RegistrationRecord | null>(null)

  async function checkRegistration(event: React.FormEvent) {
    event.preventDefault()

    const id = registrationId.trim().toUpperCase()
    const registeredEmail = email.trim().toLowerCase()

    if (!id || !registeredEmail) {
      setError(
        'Enter your Registration ID and registered email address.'
      )
      return
    }

    setLoading(true)
    setError('')
    setRegistration(null)

    try {
      const response = await fetch(
        '/api/participant/lookup',
        {
          method: 'POST',

          headers: {
            'content-type': 'application/json',
          },

          body: JSON.stringify({
            registrationId: id,
            email: registeredEmail,
          }),
        }
      )

      const result = await response.json() as {
        error?: string
        registration?: RegistrationRecord
      }

      if (!response.ok || !result.registration) {
        throw new Error(
          result.error ||
            'Registration could not be found.'
        )
      }

      setRegistration(result.registration)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Registration could not be checked. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

async function downloadRegistrationPdf() {
  if (!registration) return

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  const forest: [number, number, number] = [23, 75, 53]
  const border: [number, number, number] = [183, 208, 191]
  const pale: [number, number, number] = [245, 250, 246]
  const green: [number, number, number] = [221, 239, 227]
  const warangCitiHeaderImage = await createWarangCitiTextImage('𑢴𑢢𑢴𑢣𑢶 𑢹𑢩𑢩 𑢮𑢣𑢡𑢳 𑢮𑢣𑢶𑢣𑢼 : 𑢽𑢢𑢼𑢮𑢩𑢳')

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
    } catch {
      return null
    }
  }

  const logoData = await imageData('/nhym-logo2.jpg')
  const hoSamajLogoData = await imageData('/ho-samaj-logo.jpg')
  let y = 41

  function addHeader(continuation = false) {
    if (hoSamajLogoData) {
      const props = pdf.getImageProperties(hoSamajLogoData)
      const scale = Math.min(20 / props.width, 20 / props.height)
      pdf.addImage(hoSamajLogoData, 'JPEG', margin + (20 - props.width * scale) / 2, 5 + (20 - props.height * scale) / 2, props.width * scale, props.height * scale)
    }
    if (logoData) {
      const props = pdf.getImageProperties(logoData)
      const scale = Math.min(20 / props.width, 20 / props.height)
      pdf.addImage(logoData, 'JPEG', pageWidth - margin - 20 + (20 - props.width * scale) / 2, 5 + (20 - props.height * scale) / 2, props.width * scale, props.height * scale)
    }
    if (warangCitiHeaderImage && !continuation) pdf.addImage(warangCitiHeaderImage, 'PNG', pageWidth / 2 - 31, 3, 62, 4.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.setTextColor(...forest)
    pdf.text('NATIONAL HO YOUTH MEET : SIRJON', pageWidth / 2, 13, { align: 'center' })
    pdf.setFontSize(9)
    pdf.text('2026', pageWidth / 2, 18, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(72, 30, 20)
    pdf.text('Organized By : Adivasi Ho Samaj Yuva Mahasabha', pageWidth / 2, 22.5, { align: 'center' })
    pdf.text('Jamshedpur • 28–29 November 2026', pageWidth / 2, 26, { align: 'center' })
    pdf.setFillColor(...green)
    pdf.setDrawColor(...forest)
    pdf.roundedRect(margin, 30, contentWidth, 7, 1.2, 1.2, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...forest)
    pdf.text(continuation ? 'REGISTRATION CONFIRMATION • ' + registration!.registrationId : 'REGISTRATION CONFIRMATION', pageWidth / 2, 34.5, { align: 'center' })
    pdf.setDrawColor(...border)
    pdf.line(margin, 39, pageWidth - margin, 39)
    y = 44
  }

  function addFooter() {
    const pages = pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page)
      pdf.setDrawColor(...border)
      pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.8)
      pdf.setTextColor(82, 103, 90)
      pdf.text('Adivasi Ho Samaj Bhawan, Golmuri, Jamshedpur–831003 • nhym2026jsr@gmail.com • 9931333025, 7870979751', pageWidth / 2, pageHeight - 14, { align: 'center' })
      pdf.text('Page ' + page + ' of ' + pages, pageWidth - margin, pageHeight - 7, { align: 'right' })
    }
  }

  function ensureSpace(height: number) {
    if (y + height > pageHeight - 24) {
      pdf.addPage()
      addHeader(true)
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
  pair('Registration ID', registration.registrationId, 'Status', statusLabel(registration.status))
  pair('Registered Email', registration.email, 'Total Amount', 'INR ' + registration.totalAmount.toLocaleString('en-IN'))
  pair('Payment Method', registration.paymentMode.toUpperCase(), 'Participants', String(registration.participants.length))
  pair('Submitted', formatDate(registration.createdAt), 'Approval Email', registration.approvalEmailSent ? 'Sent' : 'Not sent yet')

  registration.participants.forEach((p) => {
    y += 4
    section('Participant ' + p.participant_no + ' Details')
    full('Participant Name', p.name || '—')
    pair('Category', categoryLabel(p.category), 'Participant Fee', 'INR ' + Number(p.fee || 0).toLocaleString('en-IN'))
    pair('Date of Birth', p.dob || '—', 'Age', p.age || '—')
    pair('Gender', p.gender || '—', 'District', p.district || '—')
    pair('State', p.state || '—', 'Accommodation', yesNo(p.accommodation))
    pair('From Outside Jamshedpur', yesNo(p.from_outside), 'Cultural', yesNo(p.cultural))
    pair('Sports', yesNo(p.sports), 'Note', p.note || '—')
    full('Activities', activities(p.activities_json))
  })

  addFooter()
  pdf.save(registration.registrationId + '-Registration.pdf')
}
  function clearLookup() {
    setRegistration(null)
    setError('')
    setRegistrationId('')
    setEmail('')
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card px-gutter py-5">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4">
          <Link to="/" className="rounded-md">
            <Brand />

            <span className="sr-only">
              National Ho Youth Meet 2026 home
            </span>
          </Link>

          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft
                className="mr-2 size-4"
                aria-hidden="true"
              />

              Back to website
            </Link>
          </Button>
        </div>
      </header>

      <main className="px-gutter py-section">
        <div
          className={
            registration
              ? 'mx-auto max-w-3xl'
              : 'mx-auto max-w-md'
          }
        >
          <div className="text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-secondary">
              <UserRound
                className="size-7 text-brand"
                aria-hidden="true"
              />
            </div>

            <p className="mt-5 font-label text-xs font-semibold tracking-[0.16em] text-brand uppercase">
              National Ho Youth Meet 2026
            </p>

            <h1 className="mt-2 font-display text-3xl font-bold">
              Participant Portal
            </h1>

            <p className="mt-3 text-muted-foreground">
              Check your NHYM 2026 registration and
              approval status.
            </p>
          </div>

          {!registration ? (
            <form
              onSubmit={checkRegistration}
              className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7"
            >
              <div>
                <Label htmlFor="registration-id">
                  Registration ID
                </Label>

                <Input
                  id="registration-id"
                  value={registrationId}
                  onChange={(event) =>
                    setRegistrationId(event.target.value)
                  }
                  placeholder="NHYM26-000001"
                  autoComplete="off"
                  className="mt-2 h-12 font-mono uppercase"
                />

                <p className="mt-2 text-xs text-muted-foreground">
                  Enter the Registration ID received after
                  submitting your registration.
                </p>
              </div>

              <div className="mt-5">
                <Label htmlFor="participant-email">
                  Registered Email Address
                </Label>

                <Input
                  id="participant-email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="mt-2 h-12"
                />

                <p className="mt-2 text-xs text-muted-foreground">
                  Use the same email address entered during
                  registration.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="mt-6 h-12 w-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Search
                  className="mr-2 size-4"
                  aria-hidden="true"
                />

                {loading
                  ? 'Checking...'
                  : 'Check Registration'}
              </Button>

              <div className="mt-6 flex items-start gap-3 border-t border-border pt-5">
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0 text-brand"
                  aria-hidden="true"
                />

                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your Registration ID and registered email
                  address are required to access registration
                  information.
                </p>
              </div>
            </form>
          ) : (
            <div className="mt-8 space-y-5">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Registration ID
                    </p>

                    <p className="mt-1 font-mono text-xl font-semibold">
                      {registration.registrationId}
                    </p>
                  </div>

                  <div
                    className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${statusClasses(
                      registration.status
                    )}`}
                  >
                    {registration.status ===
                    'APPROVED' ? (
                      <CheckCircle2 className="size-4" />
                    ) : registration.status ===
                      'REJECTED' ? (
                      <XCircle className="size-4" />
                    ) : (
                      <Clock3 className="size-4" />
                    )}

                    {statusLabel(
                      registration.status
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Registered email
                    </p>

                    <p className="mt-1 font-medium">
                      {maskEmail(registration.email)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Number of participants
                    </p>

                    <p className="mt-1 font-medium">
                      {registration.participants.length}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Registration amount
                    </p>

                    <p className="mt-1 font-display text-xl font-semibold">
                      ₹
                      {registration.totalAmount.toLocaleString(
                        'en-IN'
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Payment method
                    </p>

                    <p className="mt-1 font-medium uppercase">
                      {registration.paymentMode}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Submitted
                    </p>

                    <p className="mt-1 font-medium">
                      {formatDate(
                        registration.createdAt
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Approval email
                    </p>

                    <p className="mt-1 font-medium">
                      {registration.approvalEmailSent
                        ? 'Sent'
                        : 'Not sent yet'}
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="font-display text-2xl font-semibold">
                  Participants
                </h2>

                <div className="mt-4 space-y-4">
                  {registration.participants.map(
                    (participant) => (
                      <article
                        key={participant.participant_no}
                        className="rounded-xl border border-border bg-card p-5 sm:p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                              Participant{' '}
                              {participant.participant_no}
                            </p>

                            <h3 className="mt-1 font-display text-xl font-semibold">
                              {participant.name}
                            </h3>
                          </div>

                          <p className="font-display text-lg font-semibold">
                            ₹
                            {Number(
                              participant.fee
                            ).toLocaleString('en-IN')}
                          </p>
                        </div>

                        <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Category
                            </dt>

                            <dd className="mt-1 font-medium">
                              {categoryLabel(
                                participant.category
                              )}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Date of Birth
                            </dt>

                            <dd className="mt-1 font-medium">
                              {participant.dob || '—'}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Gender
                            </dt>

                            <dd className="mt-1 font-medium capitalize">
                              {participant.gender || '—'}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-xs text-muted-foreground">
                              District / State
                            </dt>

                            <dd className="mt-1 font-medium">
                              {[
                                participant.district,
                                participant.state,
                              ]
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Accommodation required
                            </dt>

                            <dd className="mt-1 font-medium">
                              {yesNo(
                                participant.accommodation
                              )}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-xs text-muted-foreground">
                              Travelling from outside
                              Jamshedpur
                            </dt>

                            <dd className="mt-1 font-medium">
                              {yesNo(
                                participant.from_outside
                              )}
                            </dd>
                          </div>

                          <div className="sm:col-span-2">
                            <dt className="text-xs text-muted-foreground">
                              Activities
                            </dt>

                            <dd className="mt-1 font-medium">
                              {activities(
                                participant.activities_json
                              )}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    )
                  )}
                </div>
              </section>

              <div className="flex flex-wrap gap-3">
  <Button
    type="button"
    className="h-11 bg-brand text-brand-foreground hover:bg-brand/90"
    onClick={downloadRegistrationPdf}
  >
    Download Registration PDF
  </Button>

  <Button
    type="button"
    variant="outline"
    className="h-11"
    onClick={clearLookup}
  >
    Check another registration
  </Button>
</div>
            </div>
          )}

          {!registration && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Haven&apos;t registered yet?{' '}
              <Link
                to="/#register"
                className="font-medium text-foreground underline decoration-brand/60 underline-offset-4"
              >
                Register for NHYM 2026
              </Link>
            </p>
          )}
        </div>
      </main>
      <DeveloperCredit />
    </div>
  )
}