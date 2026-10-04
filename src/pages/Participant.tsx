import { useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Participant() {
  const [registrationId, setRegistrationId] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    try {
      /*
       * The participant API will be connected in the next step.
       * For now this confirms that the portal page itself is working.
       */
      setError(
        'Participant lookup will be available after the next website update.'
      )
    } finally {
      setLoading(false)
    }
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
        <div className="mx-auto max-w-md">
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
              Check your NHYM 2026 registration and approval
              status.
            </p>
          </div>

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
                className="mt-5 rounded-md border border-border bg-secondary/50 px-4 py-3 text-sm"
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

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Haven&apos;t registered yet?{' '}
            <Link
              to="/#register"
              className="font-medium text-foreground underline decoration-brand/60 underline-offset-4"
            >
              Register for NHYM 2026
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
