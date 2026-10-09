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
  const [shareMessage, setShareMessage] = useState('')
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<number[]>([])
  const [bulkShareMessage, setBulkShareMessage] = useState('')

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

  useEffect(() => {
    const existingIds = new Set(photos.map((photo) => photo.id))
    setSelectedDownloadIds((current) => current.filter((id) => existingIds.has(id)))
  }, [photos])

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

  const toggleDownloadSelection = (photoId: number) => {
    setSelectedDownloadIds((current) =>
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId]
    )
  }

  const selectAllVisiblePhotos = () => {
    const visibleIds = filteredPhotos.map((photo) => photo.id)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedDownloadIds.includes(id))

    setSelectedDownloadIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds]))
    )
  }

  const shareSelectedPhotos = async () => {
    const selected = photos.filter((photo) => selectedDownloadIds.includes(photo.id))
    if (!selected.length) return

    const photoLinks = selected.map((photo) => ({
      title: photo.title || `NHYM Photo ${photo.id}`,
      url: new URL(photo.imageUrl, window.location.origin).toString(),
    }))

    try {
      if (navigator.share && photoLinks.length === 1) {
        await navigator.share({
          title: photoLinks[0].title,
          url: photoLinks[0].url,
        })
        setBulkShareMessage('Share menu opened.')
        return
      }

      const shareText = [
        'NHYM 2026 Photo Gallery',
        ...photoLinks.map((photo) => `${photo.title}: ${photo.url}`),
      ].join('\\n')

      if (navigator.share && navigator.canShare) {
        const filesOrUrls = { title: 'NHYM 2026 Photos', text: shareText }
        if (navigator.canShare(filesOrUrls)) {
          await navigator.share(filesOrUrls)
          setBulkShareMessage(`Share menu opened for ${photoLinks.length} selected photos.`)
          return
        }
      }

      await navigator.clipboard.writeText(shareText)
      setBulkShareMessage(
        `${photoLinks.length} photo links copied. Paste them into WhatsApp or another app to share.`
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return

      try {
        const shareText = [
          'NHYM 2026 Photo Gallery',
          ...photoLinks.map((photo) => `${photo.title}: ${photo.url}`),
        ].join('\\n')
        await navigator.clipboard.writeText(shareText)
        setBulkShareMessage(
          `${photoLinks.length} photo links copied. Paste them into WhatsApp or another app to share.`
        )
      } catch {
        setBulkShareMessage('Bulk sharing is unavailable in this browser. Try selecting fewer photos or copy the links individually.')
      }
    }
  }

  const downloadSelectedPhotos = async () => {
    const selected = photos.filter((photo) => selectedDownloadIds.includes(photo.id))
    if (!selected.length) return

    setShareMessage(`Starting download of ${selected.length} photo${selected.length === 1 ? '' : 's'}…`)

    // Start downloads one at a time with a short gap so browsers are less likely to block them.
    for (const [index, photo] of selected.entries()) {
      const link = document.createElement('a')
      link.href = new URL(photo.imageUrl, window.location.origin).toString()
      link.download = `${(photo.title || `NHYM-photo-${photo.id}`)
        .replace(/[\\/:*?"<>|]+/g, '-')
        .trim() || `NHYM-photo-${photo.id}`}.jpg`
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()

      if (index < selected.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 350))
      }
    }
    setShareMessage(`Download requests sent for ${selected.length} photo${selected.length === 1 ? '' : 's'}. Your browser may ask you to allow multiple downloads.`)
  }

  const sharePhoto = async (photo: GalleryPhoto) => {
    const shareUrl = new URL(photo.imageUrl, window.location.origin).toString()
    const shareData = {
      title: photo.title || 'NHYM 2026 Photo',
      text: photo.caption || `${photo.title} — National Ho Youth Meet 2026`,
      url: shareUrl,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareMessage('Share menu opened.')
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      setShareMessage('Photo link copied. You can share it on WhatsApp.')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return

      try {
        await navigator.clipboard.writeText(shareUrl)
        setShareMessage('Photo link copied. You can share it on WhatsApp.')
      } catch {
        setShareMessage('Sharing is unavailable in this browser. Copy the photo URL from the address bar.')
      }
    }
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

        {bulkShareMessage && (
          <div
            role="status"
            className="mx-auto mt-3 w-fit rounded-lg border border-border bg-card px-4 py-2 text-center text-sm"
          >
            {bulkShareMessage}
            <button
              type="button"
              onClick={() => setBulkShareMessage('')}
              className="ml-3 font-semibold text-primary underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {shareMessage && (
          <div
            role="status"
            className="mx-auto mt-4 w-fit rounded-lg border border-border bg-card px-4 py-2 text-center text-sm"
          >
            {shareMessage}
            <button
              type="button"
              onClick={() => setShareMessage('')}
              className="ml-3 font-semibold text-primary underline underline-offset-2"
            >
              Dismiss
            </button>
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
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={selectAllVisiblePhotos}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                {filteredPhotos.length > 0 &&
                filteredPhotos.every((photo) => selectedDownloadIds.includes(photo.id))
                  ? 'Deselect visible'
                  : 'Select all visible'}
              </button>
              <span className="text-sm text-muted-foreground">
                {selectedDownloadIds.length} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void shareSelectedPhotos()}
                disabled={selectedDownloadIds.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Share selected ({selectedDownloadIds.length}) ↗
              </button>
              <button
                type="button"
                onClick={() => void downloadSelectedPhotos()}
                disabled={selectedDownloadIds.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Download selected ({selectedDownloadIds.length}) ↓
              </button>
            </div>
          </div>
        )}

        {!loading && !error && filteredPhotos.length > 0 && (
          <div className="mt-5 columns-1 gap-5 sm:columns-2 lg:columns-3">
            {filteredPhotos.map((photo) => (
              <article
                key={photo.id}
                className="mb-5 break-inside-avoid overflow-hidden rounded-xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <label className="flex cursor-pointer items-center gap-2 border-b border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={selectedDownloadIds.includes(photo.id)}
                    onChange={() => toggleDownloadSelection(photo.id)}
                    className="h-4 w-4 accent-primary"
                    aria-label={`Select ${photo.title} for download`}
                  />
                  Select for download
                </label>
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

                  <button
                    type="button"
                    onClick={() => void sharePhoto(photo)}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted"
                  >
                    <span aria-hidden="true">↗</span>
                    Share photo
                  </button>

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
            className="absolute right-3 top-3 z-10 min-h-11 rounded-full border border-white/30 bg-black/70 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-white/15 sm:right-6 sm:top-5"
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
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/70 px-5 py-4 text-3xl text-white shadow-lg hover:bg-white/15 sm:left-6"
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
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/30 bg-black/70 px-5 py-4 text-3xl text-white shadow-lg hover:bg-white/15 sm:right-6"
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
                <button
                  type="button"
                  onClick={() => void sharePhoto(selectedPhoto)}
                  className="rounded-md border border-white/30 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Share photo ↗
                </button>
                <a
                  href={selectedPhoto.imageUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
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
