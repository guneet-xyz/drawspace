import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Logo({
  compact = false,
  className,
  href = '/',
}: {
  compact?: boolean
  className?: string
  href?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 font-semibold tracking-tight',
        className,
      )}
      aria-label="Drawspace home"
    >
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 6.5 16 4l3.5 11L8 19.5 5 6.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m9 9 9-2M8 15l9-3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg">
          drawspace<span className="text-primary">.</span>
        </span>
      )}
    </Link>
  )
}
