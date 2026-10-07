import { useEffect, useState } from 'react'
import { Link } from 'react-router'

type GalleryPhoto = {
  id: number
  title: string
  caption: string | null
  category: string
  contentType: string
  fileSize: number | null
  displayOrder: number
  createdAt: string
  imageUrl: string
}

export default function Gallery() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null)

  useEffect(() => {
    const loadPhotos = async () => {
      try {
        const response = await fetch('/api/gallery')

        if (!response.ok) {
          throw new Error('Unable to load gallery.')
        }

        const data = await response.json()
        setPhotos(Array.isArray(data.photos) ? data.photos : [])
      } catch {
        setError('Unable to load gallery at this time.')
      } finally {
        setLoading(false)
      }
    }

    void loadPhotos()
  }, [])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-gutter py-5">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/nhym-logo.jpeg"
              alt="NHYM 2026"
              className="h-12 w-12 rounded-full object-cover"
            />

            <div>
              <div className="font-display text-lg font-semibold">
                National Ho Youth Meet 2026
              </div>
              <div className="text-xs text-muted-foreground">
                Jamshedpur, Jharkhand
              </div>
            </div>
          </Link>

          <Link
            to="/"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-gutter py-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-label text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            National Ho Youth Meet 2026
          </p>

          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
            Photo Gallery
          </h1>

          <p className="mt-4 text-muted-foreground">
            Moments, culture and memories from National Ho Youth Meet.
          </p>
        </div>

        {loading && (
          <div className="py-20 text-center text-muted-foreground">
            Loading gallery...
          </div>
        )}

        {error && (
          <div className="mx-auto mt-10 max-w-xl rounded-lg border border-destructive p-4 text-center text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && photos.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            Gallery photos will be available soon.
          </div>
        )}

        {!loading && !error && photos.length > 0 && (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <article
                key={photo.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  className="block w-full cursor-zoom-in bg-muted/20"
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.title}
                    loading="lazy"
                    className="h-72 w-full object-contain"
                  />
                </button>

                <div className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    {photo.category}
                  </div>

                  <h2 className="mt-2 font-display text-xl font-semibold">
                    {photo.title}
                  </h2>

                  {photo.caption && (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {photo.caption}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedPhoto(null)}
            className="absolute right-5 top-5 rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Close
          </button>

          <img
            src={selectedPhoto.imageUrl}
            alt={selectedPhoto.title}
            className="max-h-[90vh] max-w-[95vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  )
}