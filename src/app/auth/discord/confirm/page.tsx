import Link from 'next/link'
import { getDiscordEmailLink } from '@/lib/discord-email-link'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connect Discord', referrer: 'no-referrer' }

export default async function ConfirmDiscord({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const request = await getDiscordEmailLink(token)
  return (
    <main className="flex min-h-dvh flex-col px-6 py-8">
      <Logo />
      <div className="m-auto w-full max-w-md py-14">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect Discord
        </h1>
        {request ? (
          <form
            action="/api/auth/discord/confirm"
            method="post"
            className="mt-6 space-y-5"
          >
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-muted-foreground">
              Connect the Discord account{' '}
              <strong className="text-foreground">
                {request.discord_name}
              </strong>{' '}
              to the Drawspace account for{' '}
              <strong className="text-foreground">{request.email}</strong>. This
              signs out all other sessions for this account.
            </p>
            {request.has_password && (
              <label className="flex gap-3 rounded-xl border p-4 text-sm">
                <input
                  type="checkbox"
                  name="disablePassword"
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">
                    Also turn off password sign-in
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    Choose this if you didn&apos;t set this account&apos;s
                    password yourself. You&apos;ll sign in with Discord only.
                  </span>
                </span>
              </label>
            )}
            <Button size="lg" className="w-full">
              Connect Discord
            </Button>
          </form>
        ) : (
          <p role="alert" className="mt-6 text-sm text-muted-foreground">
            This confirmation link is invalid, expired, or already used.
            Continue with Discord again to get a new one.
          </p>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
