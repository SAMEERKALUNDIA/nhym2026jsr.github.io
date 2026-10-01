import { Link } from 'react-router'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-background px-gutter py-6">
      <header className="mx-auto max-w-content">
        <Link to="/" className="inline-flex rounded-md">
          <Brand />
          <span className="sr-only">National Ho Youth Meet 2026 registration</span>
        </Link>
      </header>
      <main className="mx-auto grid min-h-[60vh] max-w-content place-items-center text-center">
        <div>
          <p className="font-label text-xs font-semibold tracking-[0.18em] text-brand uppercase">
            404
          </p>
          <h1 className="mt-3 text-[clamp(1.9rem,4vw,2.75rem)] uppercase">
            That page is not here
          </h1>
          <p className="mx-auto mt-3 max-w-prose text-muted-foreground">
            The registration form for 28 and 29 November 2026 is on the main page, along with the
            venue, the programme and the four fees.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 bg-brand px-7 text-base text-brand-foreground hover:bg-brand/90">
            <Link to="/">Go to registration</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
