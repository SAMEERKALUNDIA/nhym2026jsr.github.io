/* The mark is drawn, not defaulted: a shield-rhombus in the ink colour with a
   descending three-step stair cut out of it in white. It reads two ways — a
   hillside terrace, which is what the Ho villages sit on, and a set of steps
   going up, which is what the meet is for. Two paths, one viewBox, legible at
   16px. The favicon is the same figure. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="National Ho Youth Meet 2026"
      focusable="false"
    >
      <path d="M16 1.5 30.5 16 16 30.5 1.5 16 16 1.5Z" className="fill-primary" />
      <path
        d="M9.6 20.1h12.8l-3.9-3.9H13.5L9.6 20.1Zm3.6-5.2h9.2l-3.6-3.6h-2.1l-3.5 3.6Z"
        className="fill-primary-foreground"
      />
    </svg>
  )
}

export function Brand({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <Mark className="size-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-bold tracking-tight text-primary">
          National Ho Youth Meet 2026
        </span>
        {!compact && (
          <span className="mt-1 font-label text-[0.6875rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Jamshedpur · 28–29 NOV
          </span>
        )}
      </span>
    </span>
  )
}
