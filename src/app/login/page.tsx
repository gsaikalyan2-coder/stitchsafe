"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"

function LoginForm() {
  const authError = useSearchParams().get("error")
  const [email, setEmail] = useState("")
  const [emailSent, setEmailSent] = useState(false)

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    await signIn("resend", { email, redirect: false })
    setEmailSent(true)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-bold">Sign in to StitchSafe</h1>
      {authError && (
        <p className="w-full max-w-sm rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          Sign-in failed: {authError}
        </p>
      )}

      {/* Magic link */}
      <section className="w-full max-w-sm space-y-2">
        <h2 className="font-semibold">Email magic link</h2>
        {emailSent ? (
          <p className="text-green-600">Check your inbox for the sign-in link.</p>
        ) : (
          <form onSubmit={handleEmailSubmit} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded border px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
              Send link
            </button>
          </form>
        )}
      </section>

      {/* PayPal */}
      <section className="w-full max-w-sm">
        <h2 className="mb-2 font-semibold">Log in with PayPal</h2>
        <button
          onClick={() => signIn("paypal", { callbackUrl: "/dashboard" })}
          className="w-full rounded bg-yellow-400 px-4 py-2 text-sm font-medium"
        >
          Continue with PayPal
        </button>
      </section>
    </main>
  )
}

// useSearchParams() needs a Suspense boundary so `next build` can prerender /login.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
