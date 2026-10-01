'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { User } from '@/lib/types'
import { api, json } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AccountSettings({ user }: { user: User }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function save(
    event: React.FormEvent<HTMLFormElement>,
    password: boolean,
  ) {
    event.preventDefault()
    setBusy(true)
    const form = event.currentTarget
    try {
      await api(password ? '/account/password' : '/account', {
        method: password ? 'POST' : 'PATCH',
        body: json(Object.fromEntries(new FormData(form))),
      })
      if (password) form.reset()
      router.refresh()
      toast.success(
        password
          ? 'Password changed. Other sessions have been signed out.'
          : 'Profile updated',
      )
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-9">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A few details about the person behind the ideas.
      </p>
      <section className="mt-8 rounded-2xl border p-6">
        <h2 className="mb-5 text-sm font-semibold">Profile</h2>
        <form className="space-y-5" onSubmit={(event) => save(event, false)}>
          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm">
              Your name
            </label>
            <Input
              id="profile-name"
              name="name"
              defaultValue={user.name}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-email" className="text-sm">
              Email address
            </label>
            <Input id="profile-email" value={user.email} disabled />
            <p className="text-xs text-muted-foreground">
              Your email is used to sign in and join workspaces.
            </p>
          </div>
          <Button disabled={busy}>Save profile</Button>
        </form>
      </section>
      <section className="mt-6 rounded-2xl border p-6">
        <h2 className="mb-1 text-sm font-semibold">Change password</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Changing your password signs you out on other devices.
        </p>
        <form className="space-y-5" onSubmit={(event) => save(event, true)}>
          <div className="space-y-2">
            <label htmlFor="current-password" className="text-sm">
              Current password
            </label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm">
              New password
            </label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              minLength={10}
              maxLength={128}
              required
            />
          </div>
          <Button disabled={busy}>Update password</Button>
        </form>
      </section>
    </main>
  )
}
