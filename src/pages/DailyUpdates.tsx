import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, RefreshCw, Images } from 'lucide-react'
import { Meta } from '@/components/Meta'
import { Brand } from '@/components/Brand'
import { DeveloperCredit } from '@/components/DeveloperCredit'

type UpdatePhoto = { id: string; caption: string | null; imageUrl: string; fileSize: number }
type DailyUpdate = {
  id: string
  title: string
  body: string
  category: string
  eventDate: string
  publishedAt: string | null
  createdAt: string
  photos: UpdatePhoto[]
}

function displayDate(value: string) {
  const date = new Date(value.length === 10 ? value + 'T00:00:00' : value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export default function DailyUpdates() {
  const [updates, setUpdates] = useState<DailyUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadUpdates() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/daily-updates', { headers: { accept: 'application/json' } })
      const result = await response.json() as { updates?: DailyUpdate[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Daily updates could not be loaded.')
      setUpdates(Array.isArray(result.updates) ? result.updates : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Daily updates could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadUpdates() }, [])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <Meta title="Daily Updates — National Ho Youth Meet 2026" description="Verified daily preparation updates, photos and announcements for NHYM-26 in Jamshedpur." />
      <header className="border-b border-border/70 bg-background/95 px-gutter">
        <div className="mx-auto flex min-h-20 max-w-content items-center justify-between gap-4">
          <a href="/" className="shrink-0 rounded-md"><Brand /></a>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/updates" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Committee / Admin Login</a>
            <a href="/" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <ArrowLeft size={16} /> Home
            </a>
          </div>
        </div>
      </header>

      <section className="px-gutter py-10 sm:py-14">
        <div className="mx-auto max-w-content">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">NHYM 2026 · Jamshedpur</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">Daily Updates</h1>
            <p className="mt-3 text-lg text-muted-foreground">आयोजन की तैयारियों, महत्वपूर्ण गतिविधियों और घोषणाओं की सत्यापित जानकारी।</p>
            <p className="mt-2 text-sm text-muted-foreground">यहाँ केवल Admin द्वारा स्वीकृत और प्रकाशित अपडेट दिखाई देते हैं।</p>
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-b pb-3">
            <h2 className="text-xl font-semibold">Latest updates</h2>
            <button onClick={() => void loadUpdates()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted" disabled={loading}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {loading && <p className="py-12 text-center text-muted-foreground">Loading updates…</p>}
          {!loading && error && (
            <div className="mt-6 rounded-xl border border-destructive/40 p-5">
              <p className="font-medium">Updates could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <button onClick={() => void loadUpdates()} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Try again</button>
            </div>
          )}
          {!loading && !error && updates.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed p-10 text-center">
              <CalendarDays className="mx-auto text-muted-foreground" size={32} />
              <h3 className="mt-3 text-lg font-semibold">No updates published yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">आयोजन की पहली सत्यापित अपडेट प्रकाशित होने पर वह यहाँ दिखाई देगी।</p>
            </div>
          )}

          <div className="mt-6 grid gap-6">
            {updates.map(update => (
              <article key={update.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">{update.category}</span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CalendarDays size={14} /> {displayDate(update.eventDate)}</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold">{update.title}</h3>
                  <p className="mt-4 whitespace-pre-wrap leading-7 text-muted-foreground">{update.body}</p>
                  {update.photos?.length > 0 && (
                    <div className={`mt-5 grid gap-3 ${update.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3'}`}>
                      {update.photos.map(photo => (
                        <figure key={photo.id} className="overflow-hidden rounded-xl border">
                          <img src={photo.imageUrl} alt={photo.caption || update.title} loading="lazy" className="max-h-[520px] w-full object-cover" />
                          {photo.caption && <figcaption className="px-3 py-2 text-sm text-muted-foreground">{photo.caption}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  )}
                  <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Images size={14} /> {update.photos?.length || 0} photo{update.photos?.length === 1 ? '' : 's'}
                    {update.publishedAt && <span className="ml-auto">Published {displayDate(update.publishedAt)}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <DeveloperCredit />
    </main>
  )
}
