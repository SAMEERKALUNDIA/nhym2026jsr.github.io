import { useState } from 'react'
import {
  Check,
  IndianRupee,
  Mail,
  Phone,
  Send,
} from 'lucide-react'

import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CATEGORY_BY_ID,
  COMMITTEE,
  CONTRIBUTIONS,
  CORE_CATEGORIES,
  EVENT,
  ROLE_ORDER,
  TREASURER,
  UPI,
  VERIFICATION,
  displayPhone,
  inr,
  telHref,
  type CategoryId,
} from '@/data/event'

/* The card is stamped with a post's initial rather than numbered: the roles are
   not a sequence, and "P" and "VP" read apart at phone width. */

/* The categories the organiser's sheet files a participant under, and the
   gender options its form offers. Both are held as ids in the draft and as
   label-plus-detail pairs here, so the row, the stub and the confirmation
   cannot call the same choice two different things. */
type GenderId = 'male' | 'female' | 'undisclosed'

const GENDERS: { id: GenderId; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'undisclosed', label: 'Prefer not to say' },
]

/* How the visitor answers the three yes/no questions on the sheet. The two
   participation questions carry a "Maybe" as well, and the catalogue question at
   the foot of the form is the one place a visitor picks from the organiser's own
   list by name. `No` is the catalogue question's second option. */
type YesNo = 'yes' | 'no' | 'maybe'

type YesNoOptions = 'yesno' | 'yesnomaybe'

const ACTIVITIES = [
  'Cultural Programme',
  'Traditional Dance / Music',
  'Sports',
  'Youth Conclave',
  'Career & Education',
  'Leadership',
  'Entrepreneurship',
  'Ho Language / Warang Citi',
  'Ho Heritage & Culture',
  'Community Service',
  'General Sessions',
]

type Draft = {
  key: number
  name: string
  /* The participant details the desk's own form asks for, in its order. Every
     one of them is required: the sheet is filed by them. */
  dob: string
  gender: GenderId | ''
  address: string
  district: string
  state: string
  pin: string
  activities: string[]
  cultural: YesNo | ''
  sports: YesNo | ''
  fromOutside: YesNo | ''
  accommodation: YesNo | ''
  age: string
  category: CategoryId
  /* The audience ticket is the one amount the visitor picks for themselves, so
     it lives on the row rather than being read off the category. Empty until
     they choose; `other` holds a typed amount only for the "Other amount". */
  contribution: string
  other: string
  /* How the audience entry's contribution reaches the desk, and the reference
     from that payment. Both are asked only of an audience entry, because a core
     participant's fee is verified at the desk against the receipt. */
  mode: PaymentMode
  reference: string
  note: string
  error?: string
}

type PaymentMode = 'upi' | 'bank' | 'cash' | 'other'

/* The three declarations the organiser's form asks for, asked once for the whole
   submission rather than per person: they are about the person filling the form,
   and all three are required. The wording is the sheet's own. */
type DeclarationId = 'info' | 'payment' | 'final'

type Declaration = {
  id: DeclarationId
  label: string
  detail: string
}

const DECLARATIONS: Declaration[] = [
  {
    id: 'info',
    label: 'Participant Declaration',
    detail:
      'I confirm that the information provided by me is correct and I agree to follow the rules and instructions of NHYM 2026.',
  },
  {
    id: 'payment',
    label: 'Payment Declaration',
    detail:
      'I understand that my registration will be confirmed only after payment verification and organiser approval.',
  },
  {
    id: 'final',
    label: 'Final Confirmation',
    detail:
      'I have reviewed my registration information and confirm that it is correct.',
  },
]

const NO_DECLARATIONS: Record<DeclarationId, boolean> = {
  info: false,
  payment: false,
  final: false,
}

const PAYMENT_MODES: { id: PaymentMode; label: string }[] = [
  { id: 'upi', label: 'UPI' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash — authorised counter' },
  { id: 'other', label: 'Other' },
]

let nextKey = 2

function blank(key: number): Draft {
  return {
    key,
    name: '',
    dob: '',
    gender: '',
    address: '',
    district: '',
    state: '',
    pin: '',
    activities: [],
    cultural: '',
    sports: '',
    fromOutside: '',
    accommodation: '',
    age: '',
    category: 'student',
    contribution: '',
    other: '',
    mode: 'upi',
    reference: '',
    note: '',
  }
}

/* The sheet's own date format: day, month, year. A native date control hands
   back the same string in the browser's locale order, so this only guards what
   a keyboard entry produces. */

/* Loose on purpose: a real address can carry dots, plus signs and a long
   domain, so this only catches a missing @ or a missing dot after it. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/* Two digits at least: every mode the desk accepts issues a reference longer
   than that, and a bare "1" is almost always a slip. */
function referenceOk(value: string) {
  return value.trim().replace(/\s/g, '').length >= 2
}

/* A row's fee, or null while an audience entry has no amount chosen yet. The
   core categories read the primary fee card — the amounts given with this
   registration form — because the two cards cannot both be totalled at once. */
function feeOf(row: Draft): number | null {
  if (row.category !== 'visitor') return CATEGORY_BY_ID[row.category].fee
  if (row.contribution === 'other') {
    return /^\d+$/.test(row.other.trim()) ? Number(row.other.trim()) : null
  }
  return CONTRIBUTIONS.find((choice) => choice.id === row.contribution)?.from ?? null
}

/* What the organiser's form calls this entry, for the fee stub and for the list
   a visitor reads out to whoever takes the payment. */
function labelOf(row: Draft) {
  const terms = EVENT.terms
  return row.category === 'visitor' ? terms.audience : terms[row.category]
}

export default function Register() {
  const [rows, setRows] = useState<Draft[]>([blank(1)])
  const [agreed, setAgreed] = useState<Record<DeclarationId, boolean>>(NO_DECLARATIONS)
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState('')
  /* The address the approval message is sent to. It belongs to the submission
     rather than to a row, because the desk writes once for the whole list. */
  const [email, setEmail] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi')
  const [paymentReference, setPaymentReference] = useState('')
  const [registrationId, setRegistrationId] = useState('')
  const [sending, setSending] = useState(false)

  /* The declarations are one gate for the whole submission, so they are checked
     once and the ones still unticked are named back. */
  const unticked = DECLARATIONS.filter((declaration) => !agreed[declaration.id])

  /* Sum of every row, and whether every row has an amount it can count. */
  const total = rows.reduce((sum, row) => sum + (feeOf(row) ?? 0), 0)
  const settled = rows.every((row) => feeOf(row) !== null)
  /* The three core categories alone: the audience entry chooses a contribution
     instead of reading one fee off the list. */
  const core = CORE_CATEGORIES

  function update(key: number, patch: Partial<Draft>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addRow() {
    nextKey += 1
    setRows((prev) => [...prev, blank(nextKey)])
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.key !== key)))
  }

  function validate() {
    let ok = true
    let problem = ''
    const stillToTick = DECLARATIONS.filter((declaration) => !agreed[declaration.id])
    if (stillToTick.length > 0) {
      ok = false
      problem = `Tick ${stillToTick
        .map((declaration) => declaration.label)
        .join(', ')} before sending the registration.`
    }
    setRows((prev) =>
      prev.map((row) => {
        if (row.name.trim().length < 2) {
          ok = false
          return { ...row, error: 'Write the name as it should appear on the pass.' }
        }
if (!row.dob.trim()) {
  ok = false
  return { ...row, error: 'Select the date of birth.' }
}
        if (row.gender === '') {
          ok = false
          return { ...row, error: 'Choose Male, Female, or Prefer not to say.' }
        }
        if (row.address.trim().length < 4) {
          ok = false
          return { ...row, error: 'Write the full residential address for the desk\u2019s sheet.' }
        }
        if (row.district.trim().length < 2) {
          ok = false
          return { ...row, error: 'Write the district.' }
        }
        if (row.state.trim().length < 2) {
          ok = false
          return { ...row, error: 'Write the state or union territory.' }
        }
        if (!/^\d{6}$/.test(row.pin.trim())) {
          ok = false
          return { ...row, error: 'A PIN code is six digits.' }
        }
        if (row.activities.length === 0) {
          ok = false
          return { ...row, error: 'Tick at least one activity for this participant.' }
        }
        if (row.cultural === '') {
          ok = false
          return { ...row, error: 'Say whether this participant wants to take part in the cultural programme.' }
        }
        if (row.sports === '') {
          ok = false
          return { ...row, error: 'Say whether this participant wants to take part in sports.' }
        }
        if (row.fromOutside === '') {
          ok = false
          return { ...row, error: 'Say whether this participant is travelling from outside Jamshedpur.' }
        }
        if (row.accommodation === '') {
          ok = false
          return { ...row, error: 'Say whether accommodation is needed.' }
        }
        if (row.age.trim() !== '' && !/^\d{1,2}$/.test(row.age.trim())) {
          ok = false
          return { ...row, error: 'Age is a number of years, or leave it blank.' }
        }
        if (row.category === 'visitor' && row.contribution === '') {
          ok = false
          return {
            ...row,
            error: 'Choose a contribution of ₹100, ₹200, ₹500, or an other amount.',
          }
        }
        if (row.category === 'visitor' && row.contribution === 'other') {
          const entered = Number(row.other.trim())
          if (!/^\d+$/.test(row.other.trim()) || entered < EVENT.contributionFloor) {
            ok = false
            return {
              ...row,
              error: `An other amount is a whole number of rupees, ${inr(EVENT.contributionFloor)} or more.`,
            }
          }
        }
        if (row.category === 'visitor' && !referenceOk(row.reference)) {
          ok = false
          return {
            ...row,
            error:
              'Enter the UTR, transaction ID or receipt number of the contribution you have paid.',
          }
        }
        return { ...row, error: undefined }
      }),
    )
    if (!EMAIL.test(email.trim())) { ok = false; problem = 'Enter a valid email address.' }
    if (!referenceOk(paymentReference)) { ok = false; problem = 'Enter the UPI transaction ID, bank reference or receipt number for this registration.' }
    if (ok) setFormError('')
    else if (problem) setFormError(problem)
    else setFormError('A few entries still need attention. They are marked below.')
    return ok
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate() || sending) return
    setSending(true)
    setFormError('')
    try {
      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), total, paymentMode, paymentReference: paymentReference.trim(), agreed,
          declarations: agreed,
          participants: rows.map((row) => ({ ...row, fee: feeOf(row) ?? 0 })),
        }),
      })
      const result = await response.json() as { registrationId?: string; error?: string }
      if (!response.ok || !result.registrationId) throw new Error(result.error || 'Registration could not be saved.')
      setRegistrationId(result.registrationId)
      setSubmitted(true)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Registration could not be saved. Please try again.')
    } finally { setSending(false) }
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* ---- First screen ------------------------------------------------- */}
      <header className="relative isolate overflow-hidden px-gutter py-6">
        <div
          aria-hidden="true"
          className="glow-brand pointer-events-none absolute -top-40 -right-24 -z-10 h-[26rem] w-[26rem] opacity-70"
        />
        <div className="mx-auto flex max-w-content items-center justify-between gap-4">
  <a href="#top" className="rounded-md">
    <Brand />
    <span className="sr-only">
      Back to the top of the page
    </span>
  </a>

  <div className="flex items-center gap-2">
    <Button
      asChild
      variant="outline"
      className="h-10 px-3 sm:px-4"
    >
      <a href="/participant">
        <span className="hidden sm:inline">
          Participant Login
        </span>
        <span className="sm:hidden">
          Participant
        </span>
      </a>
    </Button>

    <Button
      asChild
      variant="outline"
      className="h-10 px-3 sm:px-4"
    >
      <a href="/admin">
        <span className="hidden sm:inline">
          Admin Login
        </span>
        <span className="sm:hidden">
          Admin
        </span>
      </a>
    </Button>
  </div>
</div>
      </header>

      <main id="top">
        <section
          id="register"
          className="relative isolate scroll-mt-6 overflow-hidden px-gutter py-section"
        >
          <div className="mx-auto max-w-content">
            <div className="max-w-2xl">
              <h2 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">
  NHYM 2026 Registration
</h2>
<p className="mt-4 text-lg text-muted-foreground">
  Register yourself or multiple participants together in a single registration.
  Add one participant at a time, select the appropriate participant category,
  and complete the required details. The total registration fee will be
  calculated automatically based on the selected participant categories.
</p>
            </div>

            <div className="relative mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-12">
              <div
                aria-hidden="true"
                className="glow-brand pointer-events-none absolute -top-20 right-0 -z-10 h-[24rem] w-[24rem] opacity-50"
              />
              <form onSubmit={submit} noValidate className="space-y-4">
                {submitted ? (
                  <Confirmation
                    rows={rows}
                    email={email}
                    registrationId={registrationId}
                    paymentMode={paymentMode}
                    paymentReference={paymentReference}
                    onEdit={() => setSubmitted(false)}
                  />
                ) : (
                  <>
                    {rows.map((row, index) => (
                      <fieldset
                        key={row.key}
                        className="rounded-lg border border-border bg-card p-4 sm:p-5"
                      >
                        <legend className="px-1 font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                          Participant {index + 1}
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-[1.6fr_0.7fr]">
                          <div className="min-w-0">
                            <Label htmlFor={`name-${row.key}`}>Full name</Label>
                            <Input
                              id={`name-${row.key}`}
                              value={row.name}
                              onChange={(e) => update(row.key, { name: e.target.value })}
                              aria-invalid={Boolean(row.error)}
                              aria-describedby={row.error ? `name-error-${row.key}` : undefined}
                              placeholder="Name as on the ID card"
                              className="mt-2 h-11"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`age-${row.key}`}>
                              Age{' '}
                              <span className="font-normal text-muted-foreground">(optional)</span>
                            </Label>
                            <Input
                              id={`age-${row.key}`}
                              value={row.age}
                              onChange={(e) => update(row.key, { age: e.target.value })}
                              inputMode="numeric"                              
                              className="mt-2 h-11"
                            />
                          </div>
                        </div>

                        {/* ---- Participant details, in the desk's own order --- */}
                        <div className="mt-6 border-t border-border pt-5">
                          <p className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                            Participant details
                          </p>
                          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                            The desk files every entry under these, so all of them are needed.
                          </p>

                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div>
                              <Label htmlFor={`dob-${row.key}`}>Date of Birth</Label>
                              <Input
  id={`dob-${row.key}`}
  type="date"
  value={row.dob}
  onChange={(e) => update(row.key, { dob: e.target.value })}
  aria-invalid={Boolean(row.error)}
  className="mt-2 h-11"
/>
                            </div>
                            <div>
                              <Label htmlFor={`gender-${row.key}`}>Gender</Label>
                              <Select
                                value={row.gender}
                                onValueChange={(value) =>
                                  update(row.key, { gender: value as GenderId, error: undefined })
                                }
                              >
                                <SelectTrigger
                                  id={`gender-${row.key}`}
                                  className="mt-2 h-11 w-full"
                                >
                                  <SelectValue placeholder="Choose" />
                                </SelectTrigger>
                                <SelectContent>
                                  {GENDERS.map((gender) => (
                                    <SelectItem key={gender.id} value={gender.id}>
                                      {gender.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label htmlFor={`address-${row.key}`}>
                              Full Residential Address
                            </Label>
                            <Input
                              id={`address-${row.key}`}
                              value={row.address}
                              onChange={(e) => update(row.key, { address: e.target.value })}
                              placeholder="House, street, village or town"
                              autoComplete="street-address"
                              className="mt-2 h-11"
                            />
                          </div>

                          <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            <div>
                              <Label htmlFor={`district-${row.key}`}>District</Label>
                              <Input
                                id={`district-${row.key}`}
                                value={row.district}
                                onChange={(e) => update(row.key, { district: e.target.value })}                                
                                className="mt-2 h-11"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`state-${row.key}`}>State / Union Territory</Label>
                              <Input
                                id={`state-${row.key}`}
                                value={row.state}
                                onChange={(e) => update(row.key, { state: e.target.value })}                                
                                className="mt-2 h-11"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`pin-${row.key}`}>PIN Code</Label>
                              <Input
                                id={`pin-${row.key}`}
                                value={row.pin}
                                onChange={(e) => update(row.key, { pin: e.target.value })}
                                inputMode="numeric"
                                autoComplete="postal-code"                                
                                className="mt-2 h-11"
                              />
                            </div>
                          </div>

                          <fieldset className="mt-6">
                            <legend className="text-sm font-medium">
                              Which NHYM activities are you interested in?
                            </legend>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Tick as many as you like. At least one is needed.
                            </p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {ACTIVITIES.map((activity) => {
                                const checked = row.activities.includes(activity)
                                return (
                                  <label
                                    key={activity}
                                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-[var(--motion-fast)] ${
                                      checked
                                        ? 'border-brand bg-secondary/50 text-foreground'
                                        : 'border-border text-muted-foreground hover:border-brand/50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        update(row.key, {
                                          activities: e.target.checked
                                            ? [...row.activities, activity]
                                            : row.activities.filter((item) => item !== activity),
                                          error: undefined,
                                        })
                                      }
                                      className="size-4 shrink-0 accent-[var(--brand)]"
                                    />
                                    <span>{activity}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </fieldset>

                          <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <YesNoRow
                              id={`cultural-${row.key}`}
                              label="Interested in Cultural Participation?"
                              value={row.cultural}
                              options="yesnomaybe"
                              onChange={(value) =>
                                update(row.key, { cultural: value, error: undefined })
                              }
                            />
                            <YesNoRow
                              id={`sports-${row.key}`}
                              label="Interested in Sports Participation?"
                              value={row.sports}
                              options="yesnomaybe"
                              onChange={(value) => update(row.key, { sports: value, error: undefined })}
                            />
                            <YesNoRow
                              id={`outside-${row.key}`}
                              label="Travelling from Outside Jamshedpur?"
                              value={row.fromOutside}
                              options="yesno"
                              onChange={(value) =>
                                update(row.key, { fromOutside: value, error: undefined })
                              }
                            />
                            <YesNoRow
                              id={`stay-${row.key}`}
                              label="Accommodation Required?"
                              hint="Accommodation is subject to availability and organiser approval."
                              value={row.accommodation}
                              options="yesno"
                              onChange={(value) =>
                                update(row.key, { accommodation: value, error: undefined })
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4">
                          <div>
                            <Label htmlFor={`category-${row.key}`}>Participant Category</Label>
                            <Select
                              value={row.category}
                              onValueChange={(value) =>
                                update(row.key, {
                                  category: value as CategoryId,
                                  error: undefined,
                                })
                              }
                            >
                              <SelectTrigger
                                id={`category-${row.key}`}
                                className="mt-2 h-11 w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {core.map((category) => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.name} — Fixed Fee {inr(category.fee)}
                                  </SelectItem>
                                ))}
                                <SelectItem value="visitor">
                                  {EVENT.terms.audience} — contribution
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Only an audience entry asks for an amount: the three
                            core categories carry a fixed fee. */}
                        {row.category === 'visitor' && (
                          <div className="mt-4 rounded-md bg-secondary/60 p-4">
                            <Label htmlFor={`contribution-${row.key}`}>
                              Audience / visitor contribution
                            </Label>
                            <div
                              id={`contribution-${row.key}`}
                              role="radiogroup"
                              aria-label="Audience or visitor contribution"
                              className="mt-3 grid gap-2 sm:grid-cols-2"
                            >
                              {CONTRIBUTIONS.map((choice) => {
                                const selected = row.contribution === choice.id
                                return (
                                  <label
                                    key={choice.id}
                                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-[var(--motion-fast)] ${
                                      selected
                                        ? 'border-brand bg-card text-foreground'
                                        : 'border-border bg-card text-muted-foreground hover:border-brand/50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`contribution-${row.key}`}
                                      value={choice.id}
                                      checked={selected}
                                      onChange={() =>
                                        update(row.key, {
                                          contribution: choice.id,
                                          error: undefined,
                                        })
                                      }
                                      className="size-4 shrink-0 accent-[var(--brand)]"
                                    />
                                    <span className="font-medium">{choice.label}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {choice.kind === 'open'
                                        ? `from ${inr(choice.from)}`
                                        : `${inr(choice.from)} to ${inr(choice.to ?? choice.from)}`}
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                            {row.contribution === 'other' && (
                              <div className="mt-3 max-w-xs">
                                <Label htmlFor={`other-${row.key}`}>
                                  Other contribution amount
                                </Label>
                                <Input
                                  id={`other-${row.key}`}
                                  value={row.other}
                                  onChange={(e) => update(row.key, { other: e.target.value })}
                                  inputMode="numeric"
                                  placeholder={String(EVENT.contributionFloor)}
                                  className="mt-2 h-11"
                                />
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Minimum {inr(EVENT.contributionFloor)}. Add a little extra if you
                                  can, for the shared costs of the meet.
                                </p>
                              </div>
                            )}

                            <p className="mt-4 text-sm text-muted-foreground">
                              Pay the displayed amount and enter the payment reference below.
                            </p>

                            <div className="mt-4 grid gap-4">
                              <div>
                                <Label htmlFor={`mode-${row.key}`}>Payment mode</Label>
                                <Select
                                  value={row.mode}
                                  onValueChange={(value) =>
                                    update(row.key, {
                                      mode: value as PaymentMode,
                                      error: undefined,
                                    })
                                  }
                                >
                                  <SelectTrigger id={`mode-${row.key}`} className="mt-2 h-11 w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAYMENT_MODES.map((mode) => (
                                      <SelectItem key={mode.id} value={mode.id}>
                                        {mode.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="max-w-sm">
                                <Label htmlFor={`reference-${row.key}`}>Payment reference</Label>
                                <Input
                                  id={`reference-${row.key}`}
                                  value={row.reference}
                                  onChange={(e) =>
                                    update(row.key, {
                                      reference: e.target.value,
                                      error: undefined,
                                    })
                                  }
                                  aria-invalid={Boolean(row.error)}
                                  placeholder="UTR / transaction ID / receipt number"
                                  className="mt-2 h-11"
                                />
                                <p className="mt-2 text-xs text-muted-foreground">
                                  The desk matches this against the payment before the pass is
                                  handed over. Cash taken at an authorised counter gets a receipt
                                  number instead.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mt-4">
                          <Label htmlFor={`note-${row.key}`}>
                            Village or district{' '}
                            <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            id={`note-${row.key}`}
                            value={row.note}
                            onChange={(e) => update(row.key, { note: e.target.value })}
                            placeholder="Town, village or block"
                            className="mt-2 h-11"
                          />
                        </div>

                        {row.error && (
                          <p
                            id={`name-error-${row.key}`}
                            className="mt-3 text-sm font-medium text-destructive"
                          >
                            {row.error}
                          </p>
                        )}

                        {rows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-3 h-11 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(row.key)}
                          >
                            Remove this participant
                          </Button>
                        )}
                      </fieldset>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-full border-dashed text-base"
                      onClick={addRow}
                    >
                      Add another participant
                    </Button>

                    <fieldset className="rounded-lg border border-border bg-card p-4 sm:p-5">
                      <legend className="px-1 font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                        Email address
                      </legend>
                      <p className="max-w-lg text-sm text-muted-foreground">
                        One address for the whole list. The registration department sends the
                        approval message here once it has verified your payment.
                      </p>
                      <div className="mt-4 max-w-md">
                        <Label htmlFor="contact-email">Email address</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          aria-invalid={formError !== '' && !EMAIL.test(email.trim())}
                          placeholder="you@example.com"
                          className="mt-2 h-11"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          The approval message comes from {EVENT.email}, so add that address to your
                          contacts and check your spam folder for it.
                        </p>
                      </div>
                    </fieldset>

                    <fieldset className="rounded-lg border border-border bg-card p-4 sm:p-5">
                      <legend className="px-1 font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Payment reference</legend>
                      <p className="max-w-lg text-sm text-muted-foreground">Pay the total using the bank/UPI details shown on this page, then enter the reference below. The committee will verify it before approval.</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div><Label>Payment method</Label><Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent></Select></div>
                        <div><Label htmlFor="payment-reference">Transaction / reference number</Label><Input id="payment-reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="UPI UTR / bank reference / receipt no." className="mt-2 h-11" /></div>
                      </div>
                    </fieldset>

                    <fieldset className="rounded-lg border border-border bg-card p-4 sm:p-5">
                      <legend className="px-1 font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                        Declarations
                      </legend>
                      <p className="max-w-lg text-sm text-muted-foreground">
                        All three are required. They cover everyone on this form.
                      </p>
                      <ul className="mt-4 space-y-3">
                        {DECLARATIONS.map((declaration) => (
                          <li
                            key={declaration.id}
                            className={`rounded-md border px-3 py-3 transition-colors duration-[var(--motion-fast)] ${
                              agreed[declaration.id]
                                ? 'border-brand/60 bg-secondary/50'
                                : 'border-border'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                id={`declare-${declaration.id}`}
                                checked={agreed[declaration.id]}
                                onChange={(e) => {
                                  setAgreed((prev) => ({
                                    ...prev,
                                    [declaration.id]: e.target.checked,
                                  }))
                                  if (e.target.checked) setFormError('')
                                }}
                                aria-invalid={unticked.length > 0 && !agreed[declaration.id]}
                                className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
                              />
                              <div>
                                <label
                                  htmlFor={`declare-${declaration.id}`}
                                  className="block cursor-pointer text-sm font-semibold"
                                >
                                  {declaration.label}{' '}
                                  <span className="font-normal text-brand" aria-hidden="true">
                                    *
                                  </span>
                                  <span className="sr-only">(required)</span>
                                </label>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {declaration.detail}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </fieldset>

                    {formError && (
                      <p role="alert" className="text-sm font-medium text-destructive">
                        {formError}
                      </p>
                    )}

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                      <Button
                        type="submit"
                        size="lg"
                        className="h-12 bg-brand px-7 text-base text-brand-foreground hover:bg-brand/90"
                      >
                        {sending ? 'Saving registration…' : 'Submit registration'}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        {rows.length} {rows.length === 1 ? 'participant' : 'participants'} ·{' '}
                        {settled
                          ? `${inr(total)} to send to the committee`
                          : 'choose a contribution to see the total'}
                        {unticked.length > 0 &&
                          ` · ${unticked.length} declaration${unticked.length === 1 ? '' : 's'} still to tick`}
                      </p>
                    </div>
                  </>
                )}
              </form>

                      <FeeStub rows={rows} total={total} />

            </div>
          </div>
        </section>

        {/* ---- Closing: the fee total, how to pay it, and who to call ------- */}
        <section className="relative isolate overflow-hidden border-t border-border px-gutter py-section">
          <div
            aria-hidden="true"
            className="glow-brand pointer-events-none absolute -bottom-32 -left-24 -z-10 h-[26rem] w-[26rem] opacity-40"
          />
          <div className="mx-auto grid max-w-content gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <h2 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">
                How the fee reaches the committee
              </h2>
              <p className="mt-4 max-w-lg text-lg text-muted-foreground">
                Add your total on the form to {TREASURER.name}, and bring the receipt to the desk on
                the morning of 28 November. The passes are handed over once the payment is verified
                and the organisers have approved the registration.
              </p>
              <dl className="mt-8 space-y-5">
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    Account name
                  </dt>
                  <dd className="mt-1 font-display text-lg font-semibold">{EVENT.account.name}</dd>
                </div>
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    Account number
                  </dt>
                  <dd className="mt-1 font-mono text-lg font-semibold tracking-[0.06em] break-all">
                    {EVENT.account.number}
                  </dd>
                </div>
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    IFSC and branch
                  </dt>
                  <dd className="mt-1 font-mono text-lg font-semibold tracking-[0.06em]">
                    {EVENT.account.ifsc}
                    <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                      {EVENT.account.branch}
                    </span>
                  </dd>
                </div>
              </dl>

              {/* The committee's own UPI code, with the two things it encodes
                  written out beside it: a visitor who cannot scan the picture
                  can still type the number or the VPA. */}
              <div className="mt-8 flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-6">
                <img
                  src="/images/ravi-sawaiyan-upi.webp"
                  alt="UPI payment code for the National Ho Youth Meet 2026, registered to Ravi Sawaiyan"
                  width={1050}
                  height={1500}
                  loading="lazy"
                  className="size-40 shrink-0 self-start rounded-md border border-border bg-card object-contain p-1.5 sm:size-44"
                />
                <div className="min-w-0">
                  <p className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    Or pay by UPI
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Scan the code with any UPI app, or enter the UPI ID by hand.
                  </p>
                  <dl className="mt-4 space-y-3">
                    <div>
                      <dt className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                        UPI ID
                      </dt>
                      <dd className="mt-1 font-mono text-base font-semibold break-all">
                        {UPI.vpa}
                      </dd>
                      <dd className="mt-1 text-sm text-muted-foreground">
                        Registered to {UPI.name}.
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Nothing is collected on this page. The totals above are only a check on your side.
              </p>
            </div>

          </div>
        </section>
      </main>

      <footer className="px-gutter py-10">
        <div className="mx-auto max-w-content">
          <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div>
              <Brand />
              <p className="mt-4 max-w-sm text-sm text-muted-foreground">
                National Ho Youth Meet 2026, Jamshedpur. 28 and 29 November 2026 at Birsa Munda Town
                Hall.
              </p>
              <p className="mt-4 max-w-sm text-sm text-muted-foreground">{EVENT.address}</p>
              <p className="mt-2 max-w-sm text-sm break-words">
                Email -{' '}
                <a
                  className="rounded-sm font-medium underline underline-offset-4"
                  href={`mailto:${EVENT.email}`}
                >
                  {EVENT.email}
                </a>
              </p>
            </div>
            <div className="sm:text-right">
              <h2 className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Office bearers
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {ROLE_ORDER.flatMap((role) =>
  COMMITTEE.filter((entry) => entry.role === role).map((person) => (
    <li key={`${person.role}-${person.name}`}>
      <span className="block font-medium text-foreground">
        {person.name} · {person.role}
      </span>

      <span className="block text-muted-foreground">
        {person.phones.map((phone, index) => (
          <span key={phone}>
            {index > 0 && ' · '}
            <a
              className="rounded-sm underline underline-offset-4"
              href={telHref(phone)}
            >
              {displayPhone(phone)}
            </a>
          </span>
        ))}
      </span>
    </li>
  ))
)}
              </ul>
            </div>
          </div>
          <Separator className="my-6" />
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p className="max-w-xl">
              Your registration will be submitted to the NHYM 2026 organising committee for review. Registration will be confirmed only after the payment has been verified and the registration has been approved by the committee.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* The fee stub beside the form: the running total, built as a ticket with a
   serrated edge so it reads as the counterfoil of the form. */
function FeeStub({ rows, total }: { rows: Draft[]; total: number }) {
  const lines = rows.map((row, index) => ({
    key: row.key,
    kind: row.category === 'visitor' ? EVENT.terms.audience : EVENT.terms[row.category],
    place: row.note.trim(),
    index: index + 1,
    amount: feeOf(row),
    mode: row.mode,
    reference: row.reference.trim(),
    activities: row.activities,
  }))

  return (
    <aside className="lg:sticky lg:top-8">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-raised">
        <div className="texture-lines flex items-baseline justify-between gap-4 bg-primary px-5 py-4 text-primary-foreground">
          <span className="font-label text-xs font-semibold tracking-[0.18em] uppercase">
            Your total
          </span>
          <span className="font-display text-3xl font-bold">{inr(total)}</span>
        </div>
        <div className="px-5 py-5">
          <ul className="space-y-3 text-sm">
            {lines.map((line) => (
              <li key={line.key} className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">
                  Participant {line.index} · {line.kind}
                  {line.place ? ` · ${line.place}` : ''}
                  {line.reference ? (
                    <span className="mt-0.5 block font-mono text-xs break-all text-muted-foreground/80">
                      {labelOfMode(line.mode)} · {line.reference}
                    </span>
                  ) : null}
                  {line.activities.length > 0 && (
                    <span className="mt-0.5 block text-xs text-muted-foreground/80">
                      {line.activities.join(' · ')}
                    </span>
                  )}
                </span>                <span className="shrink-0 font-display text-base font-semibold">
                  {line.amount === null ? '—' : inr(line.amount)}
                </span>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <IndianRupee
                  className="size-4 shrink-0 text-brand"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Payable to the committee
              </span>
              <span className="font-display text-base font-semibold text-foreground">
                {inr(total)}
              </span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>Paid on this page</span>
              <span className="font-display text-base font-semibold text-foreground">₹0</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            A contribution left unchosen shows as a dash until you pick one. The payment mode and
            reference print under an audience entry once you enter them. Nothing is charged here.
          </p>
        </div>
        <Separator />
        <div className="texture-lines h-4 bg-primary" aria-hidden="true" />
      </div>
    </aside>
  )
}

function labelOfMode(mode: PaymentMode) {
  return PAYMENT_MODES.find((entry) => entry.id === mode)?.label ?? mode
}

function yesNoLabel(value: YesNo | '') {
  return value === '' ? '' : value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Maybe'
}

/* The sheet's yes/no questions. `maybe` is offered only where the sheet offers
   it, so the four questions use two shapes of the same control. */
function YesNoRow({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: YesNo | ''
  options: YesNoOptions
  onChange: (value: YesNo) => void
}) {
  const choices: YesNo[] =
    options === 'yesnomaybe' ? ['yes', 'no', 'maybe'] : ['yes', 'no']
  return (
    <fieldset>
      <legend className={`text-sm font-medium ${hint ? 'text-muted-foreground' : ''}`}>
        {label}
      </legend>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = value === choice
          return (
            <label
              key={choice}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-[var(--motion-fast)] ${
                selected
                  ? 'border-brand bg-secondary/50 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:border-brand/50'
              }`}
            >
              <input
                type="radio"
                name={id}
                id={`${id}-${choice}`}
                value={choice}
                checked={selected}
                onChange={() => onChange(choice)}
                className="size-4 shrink-0 accent-[var(--brand)]"
              />
              <span>{yesNoLabel(choice)}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/* The confirmation. It restates exactly what was entered, because there is no
   server and nothing is sent anywhere. The one thing it cannot do on its own is
   send the approval message, so it says who does and to where. */
function Confirmation({
  rows, email, registrationId, paymentMode, paymentReference, onEdit,
}: { rows: Draft[]; email: string; registrationId: string; paymentMode: PaymentMode; paymentReference: string; onEdit: () => void }) {
  const total = rows.reduce((sum, row) => sum + (feeOf(row) ?? 0), 0)

  return (
    <div role="status" className="rounded-lg border border-success/30 bg-card p-6 shadow-raised">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
          <Check className="size-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-2xl font-bold">
            Registration saved — {registrationId}
          </h3>
          <p className="mt-2 text-muted-foreground">
            Your registration is now stored with status Pending Verification. Total: {inr(total)}.
          </p>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-border border-y border-border">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-baseline justify-between gap-4 py-3">
            <span>
              <span className="font-medium">
                {index + 1}. {row.name.trim()}
              </span>
              <span className="block text-sm text-muted-foreground">
                {labelOf(row)}
                {row.note.trim() ? ` · ${row.note.trim()}` : ''}
                {row.age.trim() ? ` · ${row.age.trim()} years` : ''}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Born {row.dob.trim()}
                {row.gender ? ` · ${GENDERS.find((g) => g.id === row.gender)?.label}` : ''}
                {' · '}
                {row.district.trim()}, {row.state.trim()} {row.pin.trim()}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {row.activities.join(' · ')}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Cultural {yesNoLabel(row.cultural)} · Sports {yesNoLabel(row.sports)} · From
                outside {yesNoLabel(row.fromOutside)} · Accommodation{' '}
                {yesNoLabel(row.accommodation)}
              </span>
              {row.category === 'visitor' && referenceOk(row.reference) && (
                <span className="mt-0.5 block font-mono text-xs break-all text-muted-foreground">
                  {labelOfMode(row.mode)} · {row.reference.trim()}
                </span>
              )}
            </span>
            <span className="shrink-0 font-display text-lg font-semibold">
              {inr(feeOf(row) ?? 0)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-md bg-secondary/60 px-4 py-3">
        <p className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Declarations given
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {DECLARATIONS.map((declaration) => (
            <li key={declaration.id} className="flex gap-2">
              <Check
                className="mt-0.5 size-4 shrink-0 text-success"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span>
                <span className="font-medium text-foreground">{declaration.label}</span> —{' '}
                {declaration.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Separator className="my-5" />

      {/* The one thing that happens off this page: the desk verifies the payment
          and writes back. Named here rather than described in general. */}
      <section aria-labelledby="verify-heading">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
          >
            <Mail className="size-4" strokeWidth={2} />
          </span>
          <div>
            <h4 id="verify-heading" className="font-display text-xl font-bold">
              {VERIFICATION.heading}
            </h4>
            <p className="mt-2 max-w-2xl text-muted-foreground">{VERIFICATION.lead}</p>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-border bg-secondary/50 px-4 py-4">
          <p className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Your email address
          </p>
          <p className="mt-1 font-mono text-base font-semibold break-all text-foreground">
            {email.trim()}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {VERIFICATION.subject} messages come from{' '}
            <a
              href={`mailto:${EVENT.email}?subject=${encodeURIComponent(
                `${VERIFICATION.subject} — ${rows[0]?.name.trim() ?? ''} (${inr(total)} paid)`,
              )}`}
              className="rounded-sm font-medium text-foreground underline decoration-brand/60 underline-offset-4 transition-colors duration-[var(--motion-fast)] hover:decoration-brand"
            >
              {EVENT.email}
            </a>
            — this address has no way of sending it, so the desk's mail is the one to wait for.
          </p>
        </div>

        <ol className="mt-5 space-y-3">
          {VERIFICATION.steps.map((step) => (
            <li key={step} className="flex gap-3 text-sm">
              <Check
                className="mt-0.5 size-4 shrink-0 text-success"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {VERIFICATION.waiting} See the account and UPI details above for the payment itself.
          <a
            href={telHref(TREASURER.phones[0])}
            className="inline-flex items-center gap-2 rounded-sm font-medium text-foreground underline decoration-brand/60 underline-offset-4 transition-colors duration-[var(--motion-fast)] hover:decoration-brand"
          >
            <Phone className="size-4 shrink-0 text-brand" strokeWidth={2} aria-hidden="true" />
            {displayPhone(TREASURER.phones[0])}
          </a>
        </p>

        {email.trim() !== '' && (
          <Button asChild variant="outline" className="mt-5 h-11">
            <a
              href={`mailto:${EVENT.email}?subject=${encodeURIComponent(
                `${VERIFICATION.subject} — ${rows[0]?.name.trim() ?? ''} (${inr(total)} paid)`,
              )}&body=${encodeURIComponent(
                [
                  `Name: ${rows.map((row) => row.name.trim()).join(', ')}`,
                  `Amount paid: ${inr(total)}`,
                  'Payment reference: ',
                  'Paid on: ',
                  'Method: ',
                  `Reply to: ${email.trim()}`,
                ].join('\n'),
              )}`}
            >
              <Send className="size-4" strokeWidth={2} aria-hidden="true" />
              Email these details to the committee
            </a>
          </Button>
        )}
      </section>

      <Separator className="my-5" />

      <p className="text-sm text-muted-foreground">
        Registration ID: <strong>{registrationId}</strong>. Payment reference: <strong>{paymentReference}</strong> ({labelOfMode(paymentMode)}). Your registration has been saved and is pending payment verification and organiser approval. Keep this registration ID for follow-up.
      </p>

      <Button type="button" variant="outline" className="mt-6 h-11" onClick={onEdit}>
        Change the list
      </Button>
    </div>
  )
}
