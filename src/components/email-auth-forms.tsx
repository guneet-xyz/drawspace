'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, json } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function useSubmit(action: (form: FormData) => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await action(new FormData(event.currentTarget))
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, onSubmit }
}

function Failure({ error }: { error: string }) {
  if (!error) return null
  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 p-3 text-sm text-destructive"
    >
      {error}
    </p>
  )
}

export function EmailLinkRequest({
  endpoint,
  minutes,
  submitLabel,
}: {
  endpoint: '/auth/password-reset' | '/auth/email-sign-in'
  minutes: number
  submitLabel: string
}) {
  const [sentTo, setSentTo] = useState('')
  const { busy, error, onSubmit } = useSubmit(async (form) => {
    const email = String(form.get('email'))
    await api(endpoint, { method: 'POST', body: json({ email }) })
    setSentTo(email)
  })
  if (sentTo)
    return (
      <p role="status" className="rounded-lg bg-muted p-4 text-sm">
        If an account exists for <strong>{sentTo}</strong>, we sent it a link.
        It expires in {minutes} minutes and works once.
      </p>
    )
  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
      <Failure error={error} />
      <Button className="w-full" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}

function finish(router: ReturnType<typeof useRouter>) {
  router.push('/app')
  router.refresh()
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const { busy, error, onSubmit } = useSubmit(async (form) => {
    await api('/auth/password-reset/confirm', {
      method: 'POST',
      body: json({ token, password: form.get('password') }),
    })
    finish(router)
  })
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="At least 10 characters"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
        <p className="text-xs text-muted-foreground">
          Saving signs you out on every other device.
        </p>
      </div>
      <Failure error={error} />
      <Button className="w-full" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        Set password and sign in
      </Button>
    </form>
  )
}

export function EmailSignInConfirm({
  token,
  firstVerification,
  hasPassword,
}: {
  token: string
  firstVerification: boolean
  hasPassword: boolean
}) {
  const router = useRouter()
  const { busy, error, onSubmit } = useSubmit(async (form) => {
    await api('/auth/email-sign-in/confirm', {
      method: 'POST',
      body: json({
        token,
        disablePassword: form.get('disablePassword') === 'on',
      }),
    })
    finish(router)
  })
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {firstVerification && (
        <p className="text-sm text-muted-foreground">
          This is the first time this email address has been confirmed, so
          signing in also signs out every other session for this account.
        </p>
      )}
      {firstVerification && hasPassword && (
        <label className="flex gap-3 rounded-xl border p-4 text-sm">
          <input type="checkbox" name="disablePassword" className="mt-1" />
          <span>
            <span className="font-medium">Also turn off password sign-in</span>
            <span className="mt-1 block text-muted-foreground">
              Choose this if you didn&apos;t set this account&apos;s password
              yourself. You can set a new one later with &ldquo;Forgot
              password&rdquo;.
            </span>
          </span>
        </label>
      )}
      <Failure error={error} />
      <Button className="w-full" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        Sign in
      </Button>
    </form>
  )
}
