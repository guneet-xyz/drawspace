'use client'

import { Button } from '@/components/ui/button'
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">We couldn’t load this space</h1>
      <p className="text-sm text-muted-foreground">
        Please try again. If this continues, check that the database is running.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
