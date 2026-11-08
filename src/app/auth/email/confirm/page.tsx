import { AuthCard, InvalidLink } from '@/components/auth-card'
import { EmailSignInConfirm } from '@/components/email-auth-forms'
import { getEmailLink } from '@/lib/email-auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in', referrer: 'no-referrer' }

// Opening the link only renders this page; signing in needs the button, so
// email link scanners can't consume it.
export default async function ConfirmEmailSignIn({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const link = await getEmailLink('sign_in', token)
  return (
    <AuthCard
      title="Sign in to Drawspace"
      description={link ? `As ${link.email}` : undefined}
    >
      {link && token ? (
        <EmailSignInConfirm
          token={token}
          firstVerification={!link.verified}
          hasPassword={link.has_password}
        />
      ) : (
        <InvalidLink href="/login/email" label="Request a new sign-in link" />
      )}
    </AuthCard>
  )
}
