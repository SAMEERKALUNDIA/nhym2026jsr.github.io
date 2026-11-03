import { DeveloperCredit } from '@/components/DeveloperCredit'
import { useState } from 'react'
import { Link } from 'react-router'
import { printSearchableHindiPdf } from '@/lib/printSearchableHindiPdf'
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
  } catch {
    // Older records may store the selected topics as comma-separated plain text.
  }

  return raw.split(/,\s*/).map(item => item.trim()).filter(Boolean).join('\n') || '—'
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

function downloadRegistrationPdf() {
  if (!registration) return
  printSearchableHindiPdf({
    title: 'REGISTRATION CONFIRMATION',
    subtitle: 'NATIONAL HO YOUTH MEET : SIRJON 2026 · Jamshedpur · 28–29 November 2026',
    orientation: 'portrait',
    sections: [
      { title: 'Registration Details', rows: [
        ['Registration ID', registration.registrationId, 'pair'],
        ['Status', statusLabel(registration.status), 'pair'],
        ['Registered Email', registration.email, 'pair'],
        ['Total Amount', '₹' + registration.totalAmount.toLocaleString('en-IN'), 'pair'],
        ['Payment Method', registration.paymentMode.toUpperCase(), 'pair'],
        ['Participants', String(registration.participants.length), 'pair'],
        ['Submitted', formatDate(registration.createdAt), 'pair'],
        ['Approval Email', registration.approvalEmailSent ? 'Sent' : 'Not sent yet', 'pair'],
      ] },
      ...registration.participants.map((p) => ({
        title: 'Participant ' + p.participant_no + ' Details',
        rows: [
          ['Participant Name', p.name || '—', 'full'],
          ['Category', categoryLabel(p.category), 'pair'],
          ['Participant Fee', '₹' + Number(p.fee || 0).toLocaleString('en-IN'), 'pair'],
          ['Date of Birth', p.dob || '—', 'pair'],
          ['Age', p.age || '—', 'pair'],
          ['Gender', p.gender || '—', 'pair'],
          ['District', p.district || '—', 'pair'],
          ['State', p.state || '—', 'pair'],
          ['Accommodation', yesNo(p.accommodation), 'pair'],
          ['From Outside Jamshedpur', yesNo(p.from_outside), 'pair'],
          ['Cultural', yesNo(p.cultural), 'pair'],
          ['Sports', yesNo(p.sports), 'pair'],
          ['Note', p.note || '—', 'full'],
          ['Activities', activities(p.activities_json), 'full'],
        ],
      })),
    ],
    footer: 'Adivasi Ho Samaj Bhawan, Golmuri, Jamshedpur-831003 · nhym2026jsr@gmail.com',
  })
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

                            <dd className="mt-1 whitespace-pre-line font-medium">
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