import credits from '@/data/photo-credits.json'

type Credit = {
  file: string
  photographer: string
  provider: string
  source_url: string
}

const PROVIDER_LABELS: Record<string, string> = {
  pexels: 'Pexels',
  unsplash: 'Unsplash',
}

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider
}

export function PhotoCredits() {
  const list = credits as Credit[]
  if (list.length === 0) return null

  return (
    <p className="text-xs text-muted-foreground">
      Photographs by{' '}
      {list.map((credit, index) => (
        <span key={credit.file}>
          {index > 0 && (index === list.length - 1 ? ' and ' : ', ')}
          <a
            className="rounded-sm underline underline-offset-4"
            href={credit.source_url}
            target="_blank"
            rel="noreferrer"
          >
            {credit.photographer.trim()}
          </a>{' '}
          on {providerLabel(credit.provider)}
        </span>
      ))}
      .
    </p>
  )
}
