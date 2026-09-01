import { Metadata } from 'next'
import LoginForm from '@/components/LoginForm'

export const metadata: Metadata = { title: 'Sign in — Merchant Radar' }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Merchant Radar</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
