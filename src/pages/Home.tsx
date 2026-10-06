import {
  CalendarDays,
  Check,
  MapPin,
  Menu,
  Phone,
  X,
} from 'lucide-react'

import { useState } from 'react'

import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  CATEGORY_SHORT,
  COMMITTEE,
  CONTRIBUTION_AMOUNTS,
  CORE_CATEGORIES,
  EVENT,
  TREASURER,
  UPI,
  displayPhone,
  inr,
  telHref,
} from '@/data/event'

/* The card is stamped with a post's initial rather than numbered: the roles are
   not a sequence, and "P" and "VP" read apart at phone width. */
const ROLE_MONOGRAM: Record<string, string> = {
  President: 'P',
  'Vice president': 'VP',
  'General secretary': 'GS',
  Secretary: 'S',
  Treasurer: 'T',
}

const PROGRAMME = [
  {
    day: 'Day one',
    date: 'Sat 28 November 2026',
    weekday: 'Saturday',
    title: 'Arrival, opening, first sessions',
    points: [
      'Registration desk opens at the town hall from 8:00 am.',
      'Opening session and welcome for all delegations.',
      'First round of youth sessions, then the cultural evening.',
    ],
  },
  {
    day: 'Day two',
    date: 'Sun 29 November 2026',
    weekday: 'Sunday',
    title: 'Sessions, resolutions, closing',
    points: [
      'Sessions resume from 9:00 am.',
      'Group discussions and the resolutions of the meet.',
      'Closing session and prize distribution.',
    ],
  },
]

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-background">
      {/* ---- First screen ------------------------------------------------- */}
<header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 px-gutter backdrop-blur">
  <div className="mx-auto flex min-h-20 max-w-content items-center justify-between gap-4">
    {/* Logo / Brand */}
    <a href="#top" className="shrink-0 rounded-md">
      <Brand />
      <span className="sr-only">Back to the top of the page</span>
    </a>

    {/* Desktop Navigation */}
    <nav
      className="hidden items-center gap-6 lg:flex"
      aria-label="Main navigation"
    >
      <a
        href="#top"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Home
      </a>

      <a
        href="#about"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        About
      </a>

      <a
        href="#fees"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Programme & Fees
      </a>

      <a
        href="#committee"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Contact
      </a>
    </nav>

    {/* Actions */}
    <div className="flex items-center gap-2">
      <Button
  type="button"
  variant="outline"
  size="icon"
  className="lg:hidden"
  onClick={() => setMobileMenuOpen((open) => !open)}
  aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
  aria-expanded={mobileMenuOpen}
  aria-controls="mobile-navigation"
>
  {mobileMenuOpen ? (
    <X className="size-5" aria-hidden="true" />
  ) : (
    <Menu className="size-5" aria-hidden="true" />
  )}
</Button>
      <Button
        asChild
        variant="outline"
        className="hidden h-10 px-4 sm:inline-flex"
      >
        <a href="/participant">Participant Login</a>
      </Button>

      <Button
        asChild
        className="h-10 bg-brand px-4 text-brand-foreground hover:bg-brand/90"
      >
        <a href="/register">
          <span className="hidden sm:inline">Register Now</span>
          <span className="sm:hidden">Register</span>
        </a>
      </Button>

      <Button
        asChild
        variant="ghost"
        className="hidden h-10 px-3 xl:inline-flex"
      >
        <a href="/admin">Admin</a>
      </Button>
        </div>
  </div>

  {mobileMenuOpen && (
    <nav
      id="mobile-navigation"
      aria-label="Mobile navigation"
      className="mx-auto max-w-content border-t border-border/70 py-3 lg:hidden"
    >
      <div className="flex flex-col gap-1">
        <a
          href="#top"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Home
        </a>

        <a
          href="#about"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted"
        >
          About
        </a>

        <a
          href="#fees"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted"
        >
          Programme & Fees
        </a>

        <a
          href="#committee"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted"
        >
          Contact
        </a>

        <div className="my-2 border-t border-border" />

        <a
          href="/participant"
          className="rounded-md px-3 py-3 text-sm font-medium hover:bg-muted"
        >
          Participant Login
        </a>

        <a
          href="/admin"
          className="rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Admin Login
        </a>
      </div>
    </nav>
  )}
</header>

      <main id="top">
        <section className="relative isolate overflow-hidden px-gutter pb-section">
          <div
            aria-hidden="true"
            className="glow-ink pointer-events-none absolute top-24 left-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 opacity-60"
          />
          <div className="mx-auto grid max-w-content items-center gap-layout lg:grid-cols-[1.05fr_1fr] lg:gap-12">
            <div>
              <p className="font-display text-5xl font-bold tracking-[0.02em] text-brand uppercase sm:text-6xl">
                {EVENT.greeting}
              </p>
              <h1 className="mt-4 text-[length:var(--hero-size)] uppercase">
                National Ho
                <br />
                Youth Meet 2026
              </h1>
              <p className="mt-3 max-w-md font-display text-xl font-medium text-primary/80">
                Jamshedpur, on 28 and 29 November 2026
              </p>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Welcome to the registration for this year&rsquo;s meet — two days of sessions,
                language and culture for Ho youth and students, with elders and families from across
                the region in the same hall.
              </p>
              
              <p className="mt-4 max-w-md text-sm text-muted-foreground">
                One form, one submission, one total for a whole family or group.
              </p>
            </div>

            {/* A paper pass card, overlapping the picture it sits on. */}
            <figure className="relative min-w-0">
              <img
                src="/images/youth-meet-hero.webp"
                alt="A crowd gathered on open ground in front of a decorated stage for an outdoor community meet"
                width={1600}
                height={1067}
                className="aspect-[4/3] w-full rounded-xl object-cover shadow-raised"
              />
              <figcaption className="relative mt-4 sm:-mt-16 sm:ml-8">
                <div className="rounded-lg border border-border bg-card p-5 shadow-raised sm:max-w-xs">
                  <p className="font-label text-[0.6875rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                    Registration pass
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-bold text-brand">28</span>
                    <span className="font-display text-xl text-primary/70">&amp;</span>
                    <span className="font-display text-4xl font-bold text-brand">29</span>
                    <span className="ml-1 font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Nov 2026
                    </span>
                  </div>
                  <Separator className="my-4" />
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <MapPin
                        className="mt-0.5 size-4 shrink-0 text-brand"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="text-muted-foreground">{EVENT.venue}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CalendarDays
                        className="mt-0.5 size-4 shrink-0 text-brand"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="text-muted-foreground">Group registrations accepted</span>
                    </li>
                  </ul>
                </div>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ---- Who is here and why: an editorial lede with a smaller picture */}
        <section
  id="about"
  className="scroll-mt-20 border-y border-border bg-card px-gutter pt-12 pb-section sm:pt-16"
>
          <div className="mx-auto grid max-w-content gap-layout lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-12">
            <div>
              <h2 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">
                Two days in Jamshedpur for Ho youth, students and elders
              </h2>
              <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
                On 28 and 29 November 2026 the Ho community&rsquo;s young people sit in one room
                with their elders at Birsa Munda Town Hall. School and college students come to
                listen and to speak. Participants come to work through the sessions. Visitors come
                to watch. Whoever you are registering, register them in one go.
              </p>
                <dl className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Dates
                  </dt>
                  <dd className="mt-1 font-display text-xl font-semibold">{EVENT.datesLabel}</dd>
                </div>
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Venue
                  </dt>
                  <dd className="mt-1 font-display text-xl font-semibold">{EVENT.venue}</dd>
                </div>
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    City
                  </dt>
                  <dd className="mt-1 font-display text-xl font-semibold">Jamshedpur</dd>
                </div>
                <div>
                  <dt className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Organised by
                  </dt>
                  <dd className="mt-1 font-display text-xl font-semibold">
                     Adivasi Ho Samaj Yuva Mahasabha / Adivasi Yuva Mahasabha
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* ---- The dark band: the programme and the fee answer --------------- */}
        <section
          id="fees"
          className="scroll-mt-6 bg-primary px-gutter py-section text-primary-foreground"
        >
          <div className="mx-auto max-w-content">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
              <div>
                <h2 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">What the two days hold</h2>
                <ol className="mt-8 space-y-6">
                  {PROGRAMME.map((day) => (
                    <li key={day.weekday} className="border-t border-primary-foreground/20 pt-5">
                      <p className="font-label text-xs font-semibold tracking-[0.16em] text-primary-foreground/70 uppercase">
                        {day.day} · {day.date}
                      </p>
                      <h3 className="mt-2 font-display text-xl font-semibold">{day.title}</h3>
                      <ul className="mt-3 space-y-2 text-primary-foreground/80">
                        {day.points.map((point) => (
                          <li key={point} className="flex gap-3">
                            <Check
                              className="mt-1 size-4 shrink-0 text-primary-foreground/60"
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                <p className="mt-6 max-w-md text-sm text-primary-foreground/70">
                  Timings are indicative. The final programme is handed to every registered group
                  at the desk on the morning of 28 November.
                </p>
              </div>

              <div id="fees-table" className="scroll-mt-6">
                <h2 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">Core participant fees</h2>
                <p className="mt-4 max-w-lg text-primary-foreground/80">
                  A core participant takes part in the sessions and the programme, and picks one of
                  three categories. The fee is the same whatever the day.
                </p>

                <ul className="mt-8">
                  {CORE_CATEGORIES.map((category) => (
                    <li
                      key={category.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-primary-foreground/20 py-4"
                    >
                      <span className="font-label text-sm font-semibold tracking-[0.16em] uppercase">
                        {CATEGORY_SHORT[category.id]}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-primary-foreground/70">
                        {category.blurb}
                      </span>
                      <span className="font-display text-3xl font-bold tracking-[0.02em] text-brand-foreground">
                        {inr(category.fee)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-10 border-t border-primary-foreground/20 pt-8">
                  <h3 className="font-display text-2xl font-semibold">
                    Audience / visitor contribution
                  </h3>
                  <p className="mt-3 max-w-lg text-sm text-primary-foreground/80">
                    Anyone attending to watch gives one of these — a family of amounts, so a
                    student and a visitor from the same village can each give what they can.
                  </p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    <li className="rounded-md bg-primary-foreground/10 px-4 py-4">
                      <span className="font-display text-2xl font-bold tracking-[0.02em]">
                        {CONTRIBUTION_AMOUNTS.map((choice) => inr(choice.from)).join(' / ')}
                      </span>
                      <span className="mt-1 block text-sm text-primary-foreground/70">
                        One contribution each
                      </span>
                    </li>
                    <li className="rounded-md bg-primary-foreground/10 px-4 py-4">
                      <span className="font-display text-2xl font-bold">Other amount</span>
                      <span className="mt-1 block text-sm text-primary-foreground/70">
                        Any amount from {inr(EVENT.contributionFloor)} up
                      </span>
                    </li>
                  </ul>
                  <p className="mt-5 text-sm text-primary-foreground/70">
                    {EVENT.subject} Fees are paid at the registration desk at the venue — nothing
                    is collected on this site.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- The committee: the people who can answer a question. A light
             band, so the page reaches the form on paper again. ------------ */}
        <section id="committee" className="scroll-mt-6 border-b border-border bg-card px-gutter py-section">
          <div className="mx-auto max-w-content">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-end lg:gap-16">
              <div>
                <h2 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">Who to call before the meet</h2>
                <p className="mt-4 max-w-md text-lg text-muted-foreground">
                  Six office bearers run the meet. Any of them can answer for the venue, the
                  programme and the fees.
                </p>
              </div>
              <p className="max-w-md text-muted-foreground lg:justify-self-end">
                Write to the committee at{' '}
                <a
                  href={`mailto:${EVENT.email}`}
                  className="rounded-sm font-medium text-foreground underline decoration-brand/60 underline-offset-4 transition-colors duration-[var(--motion-fast)] hover:decoration-brand"
                >
                  {EVENT.email}
                </a>
                , or ring the secretary or the treasurer for anything the form does not cover.
              </p>
            </div>

            <ul className="mt-10 grid gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2 lg:grid-cols-3">
              {COMMITTEE.map((person) => (
                <li
                  key={`${person.role}-${person.name}`}
                  className="flex flex-col bg-card px-5 py-6 sm:px-6"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 place-items-center rounded-md bg-primary font-label text-sm font-semibold tracking-[0.06em] text-primary-foreground"
                  >
                    {ROLE_MONOGRAM[person.role]}
                  </span>
                  <span className="mt-4 font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {person.role}
                  </span>
                  <span className="mt-1 font-display text-xl font-semibold text-foreground">
                    {person.name}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {person.phones.map((phone, index) => (
                      <span key={phone} className="inline-flex items-center gap-2">
                        {index > 0 && (
                          <span className="text-muted-foreground" aria-hidden="true">
                            ·
                          </span>
                        )}
                        <a
                          href={telHref(phone)}
                          className="inline-flex items-center gap-2 rounded-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors duration-[var(--motion-fast)] hover:text-brand hover:decoration-brand"
                        >
                          <Phone className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                          {displayPhone(phone)}
                        </a>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- Closing: the fee total, how to pay it, and who to call ------- */}
        <section className="relative isolate overflow-hidden border-t border-border px-gutter py-section">
          <div
            aria-hidden="true"
            className="glow-brand pointer-events-none absolute -bottom-32 -left-24 -z-10 h-[26rem] w-[26rem] opacity-40"
          />
          <div className="mx-auto grid max-w-content items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
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

              <p className="mt-6 text-sm text-muted-foreground">
                Nothing is collected on this page. The totals above are only a check on your side.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm lg:p-8">
  <p className="font-label text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
    Pay by UPI
  </p>

  <h3 className="mt-2 font-display text-2xl font-semibold">
    Scan &amp; pay
  </h3>

  <p className="mt-3 text-sm text-muted-foreground">
    Scan the QR code with any UPI app, or enter the UPI ID manually.
  </p>

  <img
    src="/images/ravi-sawaiyan-upi.webp"
    alt="UPI payment code for the National Ho Youth Meet 2026, registered to Ravi Sawaiyan"
    width={1050}
    height={1500}
    loading="lazy"
    className="mx-auto mt-6 w-full max-w-[280px] rounded-lg border border-border bg-background object-contain p-2"
  />

  <Separator className="my-6" />

  <dl>
    <div>
      <dt className="font-label text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        UPI ID
      </dt>
      <dd className="mt-2 font-mono text-base font-semibold break-all">
        {UPI.vpa}
      </dd>
      <dd className="mt-2 text-sm text-muted-foreground">
        Registered to {UPI.name}.
      </dd>
    </div>
  </dl>
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
          </div>
          <Separator className="my-6" />
        </div>
      </footer>
    </div>
  )
}