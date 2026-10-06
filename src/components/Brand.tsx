/* The mark is drawn, not defaulted: a shield-rhombus in the ink colour with a
   descending three-step stair cut out of it in white. It reads two ways — a
   hillside terrace, which is what the Ho villages sit on, and a set of steps
   going up, which is what the meet is for. Two paths, one viewBox, legible at
   16px. The favicon is the same figure. */

export function Brand({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <img
  src="/nhym-logo.jpeg"
  alt="National Ho Youth Meet 2026 logo"
  className="size-14 shrink-0 rounded-full object-contain"
/>
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
