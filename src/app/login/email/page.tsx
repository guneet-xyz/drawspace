import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthCard } from '@/components/auth-card'
import { EmailLinkRequest } from '@/components/email-auth-forms'
import { LINK_MINUTES } from '@/lib/email-auth'
import { mailEnabled } from '@/lib/mail'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in with email' }

export default async function EmailSignIn() {
  if (await getUser()) redirect('/app')
  return (
    <AuthCard
      title="Sign in with email"
      description="We'll email you a link that signs you in, no password needed."
    >
      {mailEnabled() ? (
        <EmailLinkRequest
          endpoint="/auth/email-sign-in"
          minutes={LINK_MINUTES.sign_in}
          submitLabel="Email me a sign-in link"
        />
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          Email sign-in isn&apos;t available on this instance.
        </p>
      )}
    </AuthCard>
  )
}
