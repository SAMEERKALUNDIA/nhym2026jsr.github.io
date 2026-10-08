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

  // -----------------------------
  // Header
  // -----------------------------
  if (logoData) {
    pdf.addImage(
      logoData,
      'JPEG',
      margin,
      8,
      28,
      28
    )
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.setTextColor(72, 30, 20)

  pdf.text(
    'NATIONAL HO YOUTH MEET 2026',
    48,
    17
  )

  pdf.setFontSize(12)
  pdf.setTextColor(40)

  pdf.text(
    'Registration Confirmation',
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

  // -----------------------------
  // Helper functions
  // -----------------------------
  function sectionTitle(title: string) {
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

  function addContinuationPage() {
    pdf.addPage()

    if (logoData) {
      pdf.addImage(
        logoData,
        'JPEG',
        margin,
        8,
        18,
        18
      )
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.setTextColor(72, 30, 20)

    pdf.text(
      'NATIONAL HO YOUTH MEET 2026',
      logoData ? 38 : margin,
      15
    )

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(100)

    pdf.text(
      `Registration ID: ${registration!.registrationId}`,
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
  }

  function ensureSpace(required: number) {
    if (y + required > pageHeight - 23) {
      addContinuationPage()
    }
  }

  const columnGap = 10

  const columnWidth =
    (contentWidth - columnGap) / 2

  const column1 = margin

  const column2 =
    margin + columnWidth + columnGap

  // -----------------------------
  // Registration Details
  // -----------------------------
  sectionTitle('Registration Details')

  let height1 = field(
    'Registration ID',
    registration.registrationId,
    column1,
    columnWidth
  )

  let height2 = field(
    'Status',
    statusLabel(registration.status),
    column2,
    columnWidth
  )

  y += Math.max(height1, height2)

  height1 = field(
    'Registered Email',
    maskEmail(registration.email),
    column1,
    columnWidth
  )

  height2 = field(
    'Total Amount',
    `INR ${Number(
      registration.totalAmount
    ).toLocaleString('en-IN')}`,
    column2,
    columnWidth
  )

  y += Math.max(height1, height2)

  height1 = field(
    'Payment Method',
    registration.paymentMode?.toUpperCase() ||
      '—',
    column1,
    columnWidth
  )

  height2 = field(
    'Approval Email',
    registration.approvalEmailSent
      ? 'Sent'
      : 'Not sent yet',
    column2,
    columnWidth
  )

  y += Math.max(height1, height2)

  height1 = field(
    'Submitted',
    formatDate(registration.createdAt),
    column1,
    contentWidth
  )

  y += height1 + 3

  // -----------------------------
  // Participant Details
  // -----------------------------
  registration.participants.forEach(
    (participant, index) => {
      ensureSpace(80)

      sectionTitle(
        registration.participants.length === 1
          ? 'Participant Details'
          : `Participant ${participant.participant_no} Details`
      )

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.setTextColor(25)

      const nameLines =
        pdf.splitTextToSize(
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
        categoryLabel(
          participant.category
        ),
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
        'Gender',
        participant.gender || '—',
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

      height1 = field(
        'Accommodation Required',
        yesNo(
          participant.accommodation
        ),
        column1,
        columnWidth
      )

      height2 = field(
        'Outside Jamshedpur',
        yesNo(
          participant.from_outside
        ),
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

      y +=
        activityLines.length * 4 + 8

      if (participant.note) {
        ensureSpace(18)

        pdf.setFont(
          'helvetica',
          'bold'
        )

        pdf.setFontSize(7.5)
        pdf.setTextColor(110)

        pdf.text(
          'NOTE',
          margin,
          y
        )

        pdf.setFont(
          'helvetica',
          'normal'
        )

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

        y +=
          noteLines.length * 4 + 8
      }

      if (
        index <
        registration.participants.length - 1
      ) {
        y += 2

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

  // -----------------------------
  // Footer on every page
  // -----------------------------
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

    pdf.setFont(
      'helvetica',
      'normal'
    )

    pdf.setFontSize(7.5)
    pdf.setTextColor(110)

    pdf.text(
      'Computer-generated registration confirmation - National Ho Youth Meet 2026',
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

  // -----------------------------
  // Download
  // -----------------------------
  pdf.save(
    `${registration.registrationId}-Registration.pdf`
  )
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