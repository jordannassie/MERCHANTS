import { Metadata } from 'next'
import LoginForm from '@/components/LoginForm'

export const metadata: Metadata = { title: 'Sign in — Merchant Radar' }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Merchant Radar</h1>
          <p className="mt-1 text-sm text-gray-500">Internal CRM — sign in to continue</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <LoginForm />
        </div>

        <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">First time setup</p>
          <p>
            Create your account in the{' '}
            <strong>Supabase Dashboard → Authentication → Users</strong>.
            This app has no public signup — accounts are created by an admin.
          </p>
        </div>
      </div>
    </div>
  )
}
