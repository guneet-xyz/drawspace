import { AuthCard, InvalidLink } from "@/components/auth-card"
import { ResetPasswordForm } from "@/components/email-auth-forms"
import { getEmailLink } from "@/lib/email-auth"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Choose a new password",
  referrer: "no-referrer",
}

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const link = await getEmailLink("password_reset", token)
  return (
    <AuthCard
      title="Choose a new password"
      description={link ? `For ${link.email}` : undefined}
    >
      {link && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <InvalidLink href="/forgot-password" label="Request a new reset link" />
      )}
    </AuthCard>
  )
}
