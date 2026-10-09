import { DeveloperCredit } from '@/components/DeveloperCredit'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

type GalleryPhoto = {
  id: number
  title: string
  caption: string | null
  category: string
  contentType?: string
  fileSize?: number | null
  displayOrder: number
  createdAt: string
  imageUrl: string
}

export default function Gallery() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null)
  const [activeCategory, setActiveCategory] = useState('All Photos')

  useEffect(() => {
    let cancelled = false

    const loadPhotos = async () => {
      try {
        const response = await fetch('/api/gallery')

        if (!response.ok) {
          throw new Error('Unable to load gallery.')
        }

        const data = await response.json()

        if (!cancelled) {
          setPhotos(Array.isArray(data.photos) ? data.photos : [])
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load gallery at this time. Please try again later.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPhotos()

    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(
    () => [
      'All Photos',
      ...Array.from(
        new Set(
          photos
            .map((photo) => photo.category?.trim())
            .filter((category): category is string => Boolean(category))
        )
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [photos]
  )

  const filteredPhotos = useMemo(
    () =>
      activeCategory === 'All Photos'
        ? photos
        : photos.filter((photo) => photo.category === activeCategory),
    [activeCategory, photos]
  )

  const selectedIndex = selectedPhoto
    ? filteredPhotos.findIndex((photo) => photo.id === selectedPhoto.id)
    : -1

  const showPrevious = () => {
    if (!filteredPhotos.length) return
    const index = selectedIndex < 0 ? 0 : selectedIndex
    setSelectedPhoto(filteredPhotos[(index - 1 + filteredPhotos.length) % filteredPhotos.length])
  }

  const showNext = () => {
    if (!filteredPhotos.length) return
    const index = selectedIndex < 0 ? 0 : selectedIndex
    setSelectedPhoto(filteredPhotos[(index + 1) % filteredPhotos.length])
  }

  useEffect(() => {
    if (!selectedPhoto) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPhoto(null)
      if (event.key === 'ArrowLeft') showPrevious()
      if (event.key === 'ArrowRight') showNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [selectedPhoto, selectedIndex, filteredPhotos])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-gutter py-4">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img
              src="/nhym-logo.jpeg"
              alt="NHYM 2026"
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <div className="truncate font-display text-base font-semibold sm:text-lg">
                National Ho Youth Meet 2026
              </div>
              <div className="text-xs text-muted-foreground">
                Jamshedpur, Jharkhand
              </div>
            </div>
          </Link>

          <Link
            to="/"
            className="shrink-0 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted sm:px-4"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-gutter pb-16 pt-10 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-label text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            National Ho Youth Meet 2026
          </p>

          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
            Photo Gallery
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Moments, culture and memories from National Ho Youth Meet.
          </p>

          {!loading && !error && photos.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {filteredPhotos.length} {filteredPhotos.length === 1 ? 'photo' : 'photos'}
              {activeCategory !== 'All Photos' ? ` in ${activeCategory}` : ' in the gallery'}
            </p>
          )}
        </div>

        {!loading && !error && photos.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Filter photos by category">
            {categories.map((category) => {
              const isActive = activeCategory === category
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category)
                    setSelectedPhoto(null)
                  }}
                  aria-pressed={isActive}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/50 hover:bg-muted'
                  }`}
                >
                  {category}
                </button>
              )
            })}
          </div>
        )}

        {loading && (
          <div className="grid gap-5 pt-10 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading photos">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-xl border border-border bg-muted/50"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mx-auto mt-10 max-w-xl rounded-xl border border-destructive/40 bg-card p-6 text-center">
            <p className="font-medium text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && photos.length === 0 && (
          <div className="mx-auto mt-10 max-w-xl rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <div className="text-4xl" aria-hidden="true">📷</div>
            <h2 className="mt-4 font-display text-xl font-semibold">Gallery coming soon</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Photos and memories from NHYM will appear here.
            </p>
          </div>
        )}

        {!loading && !error && photos.length > 0 && filteredPhotos.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">
            No photos are available in this category yet.
          </div>
        )}

        {!loading && !error && filteredPhotos.length > 0 && (
          <div className="mt-8 columns-1 gap-5 sm:columns-2 lg:columns-3">
            {filteredPhotos.map((photo) => (
              <article
                key={photo.id}
                className="mb-5 break-inside-avoid overflow-hidden rounded-xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  aria-label={`Open photo: ${photo.title}`}
                  className="group relative block w-full cursor-zoom-in overflow-hidden bg-muted/20 text-left"
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.title}
                    loading="lazy"
                    decoding="async"
                    className="h-auto max-h-[560px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    View photo ↗
                  </span>
                </button>

                <div className="p-4 sm:p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    {photo.category || 'NHYM Events'}
                  </div>

                  <h2 className="mt-2 font-display text-lg font-semibold leading-snug">
                    {photo.title}
                  </h2>

                  {photo.caption && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {photo.caption}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <DeveloperCredit />

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo viewer: ${selectedPhoto.title}`}
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedPhoto(null)}
            aria-label="Close photo viewer"
            className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/50 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 sm:right-6 sm:top-5"
          >
            Close ✕
          </button>

          {filteredPhotos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(event) => {
                  event.stopPropagation()
                  showPrevious()
                }}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-4 py-3 text-2xl text-white hover:bg-white/15 sm:left-6"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(event) => {
                  event.stopPropagation()
                  showNext()
                }}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-4 py-3 text-2xl text-white hover:bg-white/15 sm:right-6"
              >
                ›
              </button>
            </>
          )}

          <div
            className="flex max-h-[94vh] w-full max-w-6xl flex-col items-center justify-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedPhoto.imageUrl}
              alt={selectedPhoto.title}
              className="max-h-[76vh] max-w-full object-contain"
            />

            <div className="w-full max-w-3xl text-center text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                {selectedPhoto.category || 'NHYM Events'}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold sm:text-xl">
                {selectedPhoto.title}
              </h2>
              {selectedPhoto.caption && (
                <p className="mt-1 text-sm text-white/75">{selectedPhoto.caption}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <span className="text-xs text-white/60">
                  {Math.max(0, selectedIndex) + 1} of {filteredPhotos.length}
                </span>
                <a
                  href={selectedPhoto.imageUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
                >
                  Download original ↓
                </a>
              </div>
              {filteredPhotos.length > 1 && (
                <p className="mt-2 hidden text-xs text-white/50 sm:block">
                  Use ← and → to browse · Esc to close
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
