import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: 'Sign in' }
export default async function Login() {
  if (await getUser()) redirect('/app')
  return <AuthForm mode="login" />
}
