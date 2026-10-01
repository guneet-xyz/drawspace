import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Create an account' }
export default async function Signup() {
  if (await getUser()) redirect('/app')
  return (
    <AuthForm
      mode="signup"
      registrationEnabled={process.env.ALLOW_REGISTRATION !== 'false'}
    />
  )
}
