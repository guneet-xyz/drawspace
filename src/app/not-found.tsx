import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#faf9fd] px-6 text-center">
      <Logo />
      <span className="mt-14 text-6xl font-semibold text-primary/30">404</span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        This space is a little empty
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        This page or drawing isn’t available. The link may have expired, been
        revoked, or you may not have access.
      </p>
      <Button asChild className="mt-7">
        <Link href="/">
          <ArrowLeft />
          Back to your space
        </Link>
      </Button>
    </main>
  )
}
