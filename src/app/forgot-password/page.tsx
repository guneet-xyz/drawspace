import { AuthCard } from "@/components/auth-card"
import { EmailLinkRequest } from "@/components/email-auth-forms"
import { LINK_MINUTES } from "@/lib/email-auth"
import { mailEnabled } from "@/lib/mail"

export const dynamic = "force-dynamic"
export const metadata = { title: "Forgot password" }

export default function ForgotPassword() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to choose a new one."
    >
      {mailEnabled() ? (
        <EmailLinkRequest
          endpoint="/auth/password-reset"
          minutes={LINK_MINUTES.password_reset}
          submitLabel="Send reset link"
        />
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          Password reset emails aren&apos;t available on this instance. Contact
          your administrator.
        </p>
      )}
    </AuthCard>
  )
}
