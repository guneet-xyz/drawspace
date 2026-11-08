import Link from 'next/link'
import { Logo } from '@/components/logo'

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col px-6 py-8">
      <Logo />
      <div className="m-auto w-full max-w-sm py-14">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-8">{children}</div>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

export function InvalidLink({ href, label }: { href: string; label: string }) {
  return (
    <div role="alert" className="space-y-4 text-sm text-muted-foreground">
      <p>This link is invalid, expired, or already used.</p>
      <Link href={href} className="font-medium text-primary hover:underline">
        {label}
      </Link>
    </div>
  )
}
