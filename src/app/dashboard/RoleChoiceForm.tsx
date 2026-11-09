"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function RoleChoiceForm() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function choose(role: "TAILOR" | "CUSTOMER") {
    setLoading(true)
    await fetch("/api/me/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    router.refresh()
  }

  return (
    <section className="w-full max-w-sm space-y-2 rounded border p-4">
      <h2 className="font-semibold">Who are you?</h2>
      <div className="flex gap-3">
        <button
          onClick={() => choose("TAILOR")}
          disabled={loading}
          className="flex-1 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          I am a Tailor
        </button>
        <button
          onClick={() => choose("CUSTOMER")}
          disabled={loading}
          className="flex-1 rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          I am a Customer
        </button>
      </div>
    </section>
  )
}
