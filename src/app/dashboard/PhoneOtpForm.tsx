"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth"
import type { ConfirmationResult } from "firebase/auth"
import { firebaseAuth } from "@/lib/firebase-client"

function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "")
  return digits.startsWith("+") ? digits : `+${digits}`
}

function describeError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code)
    const message = err instanceof Error ? err.message : ""
    return `${code}${message ? ` — ${message}` : ""}`
  }
  return err instanceof Error ? err.message : "Something went wrong"
}

export default function PhoneOtpForm() {
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const verifierRef = useRef<RecaptchaVerifier | null>(null)
  const router = useRouter()

  function resetVerifier() {
    verifierRef.current?.clear()
    verifierRef.current = null
  }

  useEffect(() => resetVerifier, [])

  function getVerifier(): RecaptchaVerifier {
    if (!verifierRef.current) {
      verifierRef.current = new RecaptchaVerifier(firebaseAuth, "phone-recaptcha", { size: "invisible" })
    }
    return verifierRef.current
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const result = await signInWithPhoneNumber(firebaseAuth, toE164(phone), getVerifier())
      setConfirmResult(result)
    } catch (err) {
      console.error("[phone-otp] send failed", err)
      resetVerifier()
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!confirmResult) return
    setBusy(true)
    try {
      const credential = await confirmResult.confirm(otp.trim())
      const idToken = await credential.user.getIdToken()
      const res = await fetch("/api/auth/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(`Server rejected verification (${res.status}${body.error ? `: ${body.error}` : ""})`)
      }
      router.refresh()
    } catch (err) {
      console.error("[phone-otp] verify failed", err)
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setConfirmResult(null)
    setOtp("")
    setError("")
    resetVerifier()
  }

  return (
    <section className="w-full max-w-sm space-y-2 rounded border p-4">
      <h2 className="font-semibold">Verify phone number</h2>
      {!confirmResult ? (
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+16505551234"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="6-digit code"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Checking…" : "Verify"}
          </button>
        </form>
      )}
      {confirmResult && (
        <button type="button" onClick={startOver} className="text-xs text-gray-500 underline">
          Use a different number
        </button>
      )}
      {error && <p className="text-sm text-red-600 break-words">{error}</p>}
      <div id="phone-recaptcha" />
    </section>
  )
}
