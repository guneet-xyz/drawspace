'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, Loader2, PencilLine } from 'lucide-react'
import { api, json } from '@/lib/api-client'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IdeaPreview } from '@/components/idea-preview'

export function AuthForm({
  mode,
  registrationEnabled = true,
}: {
  mode: 'login' | 'signup'
  registrationEnabled?: boolean
}) {
  const signup = mode === 'signup'
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      await api(`/auth/${signup ? 'register' : 'login'}`, {
        method: 'POST',
        body: json(Object.fromEntries(form)),
      })
      router.push('/app')
      router.refresh()
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#f3f0fa] p-12 lg:flex">
        <Logo />
        <div>
          <span className="text-sm font-medium text-primary">
            A blank canvas. A fresh perspective.
          </span>
          <h2 className="mt-4 max-w-md text-4xl leading-tight font-semibold tracking-tight">
            Good things start
            <br />
            with a little scribble.
          </h2>
          <IdeaPreview className="my-6 w-full" />
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Give your ideas a place to grow. Sketch, organize, and share — all
            in a space you control.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Your ideas. Your people. Your space.
        </span>
      </aside>
      <main className="flex flex-col px-6 py-8">
        <Logo className="lg:hidden" />
        <div className="m-auto w-full max-w-sm py-14">
          <span className="mb-6 flex size-12 items-center justify-center rounded-2xl border bg-muted">
            <PencilLine className="size-6 text-primary" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {signup ? 'Make room for your ideas' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {signup
              ? 'Create an account. Your first workspace is on us.'
              : 'Your next great idea is right where you left it.'}
          </p>
          {signup && !registrationEnabled ? (
            <div className="mt-8 rounded-xl border bg-muted p-5 text-sm">
              New registrations are disabled. Contact your administrator to get
              access.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5">
              {signup && (
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Your name
                  </label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Alex Morgan"
                    autoComplete="name"
                    required
                    maxLength={80}
                  />
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={
                    signup ? 'At least 10 characters' : 'Your password'
                  }
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  minLength={signup ? 10 : 1}
                  maxLength={128}
                  required
                />
                {signup && (
                  <p className="text-xs text-muted-foreground">
                    Use at least 10 characters to keep your ideas safe.
                  </p>
                )}
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Button className="w-full" size="lg" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {signup ? 'Create account' : 'Sign in'}
                {!busy && <ArrowRight />}
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {signup ? 'Already have a space?' : 'New to Drawspace?'}{' '}
            <Link
              href={signup ? '/login' : '/signup'}
              className="font-medium text-primary hover:underline"
            >
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <div className="my-7 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or just start sketching
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" asChild className="w-full">
            <Link href="/guest">Continue as a guest</Link>
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            No account needed. Saved in this browser only.
          </p>
        </div>
      </main>
    </div>
  )
}
