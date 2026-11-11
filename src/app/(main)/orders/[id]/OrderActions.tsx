"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js"

async function safeFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const text = await res.text()
  let data: Record<string, unknown>
  try { data = JSON.parse(text) } catch { data = {} }
  if (!res.ok) {
    throw new Error((data.error as string) ?? (data.message as string) ?? `Server ${res.status}: ${text.slice(0, 200)}`)
  }
  return data
}

// ── Dispute button ─────────────────────────────────────────────────────────────

export function DisputeButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function submit() {
    startTransition(async () => {
      try {
        await safeFetch(`/api/orders/${orderId}/dispute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: reason }),
        })
        router.refresh()
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error")
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
      >
        Report a problem
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800">Describe the problem</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-red-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        placeholder="What went wrong?"
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pending || !reason.trim()}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-red-700"
        >
          {pending ? "Submitting…" : "Submit dispute"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Cancel order button ─────────────────────────────────────────────────────────

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function doCancel() {
    startTransition(async () => {
      try {
        await safeFetch(`/api/orders/${orderId}/cancel`, { method: "POST" })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error")
      }
    })
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        Cancel order
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
      <p className="text-sm text-gray-700">Are you sure you want to cancel this order?</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={doCancel}
          disabled={pending}
          className="rounded-lg bg-gray-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800"
        >
          {pending ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          No, keep
        </button>
      </div>
    </div>
  )
}

// ── Accept checklist ───────────────────────────────────────────────────────────

export function AcceptChecklistButton({ orderId, versionId }: { orderId: string; versionId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function accept() {
    startTransition(async () => {
      try {
        await safeFetch(`/api/orders/${orderId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId }),
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error")
      }
    })
  }

  return (
    <div>
      <button
        onClick={accept}
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
      >
        {pending ? "Accepting…" : "Accept checklist"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

// ── Change request form ────────────────────────────────────────────────────────

export function ChangeRequestForm({ orderId }: { orderId: string }) {
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function submit() {
    startTransition(async () => {
      try {
        setError(null)
        const data = await safeFetch(`/api/orders/${orderId}/changes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }) as { changeRequestId?: string; needsManualReview?: boolean }
        if (data.needsManualReview) {
          setResult("Your request needs manual review. We'll be in touch.")
        } else {
          setResult("Change request sent. Waiting for the tailor to price it.")
          setText("")
          router.refresh()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error")
      }
    })
  }

  return (
    <div className="space-y-3">
      {result ? (
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          {result}
          <button onClick={() => setResult(null)} className="ml-2 text-blue-600 underline">OK</button>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Describe what you'd like to change…"
          />
          <button
            onClick={submit}
            disabled={pending || !text.trim()}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
          >
            {pending ? "Sending…" : "Request change"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  )
}

// ── Change Requests Manager (Accept / Reject) ─────────────────────────────────

export function ChangeRequestsManager({
  orderId,
  changeRequests,
  isCustomer,
}: {
  orderId: string;
  changeRequests: Array<{
    id: string;
    changeDiff: unknown;
    status: string;
    priceLines: Array<{ id: string; label: string; amountCents: number }>;
    createdAt: Date | string;
  }>;
  isCustomer: boolean;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (changeRequests.length === 0) return null;

  async function handleAccept(changeId: string) {
    setLoadingId(changeId);
    setActionError(null);
    try {
      await safeFetch(`/api/orders/${orderId}/changes/${changeId}/accept`, {
        method: "POST",
      });
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to accept change");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleReject(changeId: string) {
    setLoadingId(changeId);
    setActionError(null);
    try {
      await safeFetch(`/api/orders/${orderId}/changes/${changeId}/reject`, {
        method: "POST",
      });
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject change");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {actionError}
        </div>
      )}
      {changeRequests.map((cr) => {
        const diff = cr.changeDiff as {
          customerDescription?: string;
          explanation?: string;
          added?: Array<{ label_en: string }>;
          modified?: Array<{ label_en: string }>;
        } | null;
        const description =
          diff?.customerDescription ||
          diff?.explanation ||
          (diff?.added && diff.added.length > 0 ? diff.added.map((a) => a.label_en).join(", ") : "Scope alteration");
        const addOnCents = cr.priceLines.reduce((s, l) => s + l.amountCents, 0);

        return (
          <div
            key={cr.id}
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">{description}</p>
                {addOnCents > 0 && (
                  <p className="text-[11px] font-bold text-amber-700 mt-0.5">
                    Quoted Add-on: +${(addOnCents / 100).toFixed(2)} USD
                  </p>
                )}
              </div>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  cr.status === "ACCEPTED"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : cr.status === "REJECTED"
                      ? "bg-slate-200 text-slate-700"
                      : cr.status === "PRICED"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {cr.status === "ACCEPTED"
                  ? "✓ Accepted"
                  : cr.status === "REJECTED"
                    ? "✕ Declined"
                    : cr.status === "PRICED"
                      ? "Price Quoted"
                      : "Pending Review"}
              </span>
            </div>

            {/* Action buttons when change is priced */}
            {cr.status === "PRICED" && isCustomer && (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600">
                  Tailor quoted <strong>${(addOnCents / 100).toFixed(2)} USD</strong>. Accept to update garment specs.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAccept(cr.id)}
                    disabled={loadingId === cr.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {loadingId === cr.id ? "Updating…" : "✓ Accept Change"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(cr.id)}
                    disabled={loadingId === cr.id}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {loadingId === cr.id ? "Updating…" : "✕ Decline"}
                  </button>
                </div>
              </div>
            )}

            {cr.status === "PENDING_PRICE" && isCustomer && (
              <p className="text-[11px] text-slate-500 italic">
                Sri Karthika Tailors is reviewing this request and will provide an add-on quote shortly.
              </p>
            )}

            {cr.status === "ACCEPTED" && (
              <p className="text-[11px] text-emerald-700 font-medium">
                ✓ Change accepted and merged into garment specifications checklist.
              </p>
            )}

            {cr.status === "REJECTED" && (
              <p className="text-[11px] text-slate-500">
                ✕ This alteration was declined. Existing garment specifications remain unchanged.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Accept change ──────────────────────────────────────────────────────────────

export function AcceptChangeButton({ orderId: _orderId, changeId: _changeId }: { orderId: string; changeId: string }) {
  return (
    <button
      disabled
      className="rounded-lg bg-gray-400 px-3 py-1 text-xs font-medium text-white cursor-not-allowed"
    >
      Add-on payment coming soon
    </button>
  )
}

// ── Resolve failed checks ──────────────────────────────────────────────────────

export function ResolveFailedChecks({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function resolve(resolution: "ACCEPT_ANYWAY" | "CANCEL") {
    startTransition(async () => {
      try {
        await safeFetch(`/api/orders/${orderId}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution }),
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error")
      }
    })
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-sm font-medium text-amber-800">
        The outfit didn&apos;t pass the photo check after two rounds. What would you like to do?
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => resolve("ACCEPT_ANYWAY")}
          disabled={pending}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-amber-700"
        >
          Accept anyway
        </button>
        <button
          onClick={() => resolve("CANCEL")}
          disabled={pending}
          className="rounded-lg border border-red-300 px-4 py-1.5 text-sm text-red-600 disabled:opacity-50 hover:bg-red-50"
        >
          Cancel &amp; get refund
        </button>
      </div>
    </div>
  )
}

// ── PayPal pay button (M2) ─────────────────────────────────────────────────────

export function PayPalPayButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""

  return (
    <div className="space-y-2">
      <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD" }}>
        <PayPalButtons
          style={{ layout: "vertical", label: "pay" }}
          createOrder={async () => {
            setError(null)
            const res = await fetch(`/api/orders/${orderId}/payment`, { method: "POST" })
            if (!res.ok) {
              const body = await res.json().catch(() => ({})) as { error?: string }
              throw new Error(body.error ?? "Failed to create PayPal order")
            }
            const data = await res.json() as { paypalOrderId: string }
            return data.paypalOrderId
          }}
          onApprove={async (data) => {
            const res = await fetch(`/api/orders/${orderId}/payment/authorize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paypalOrderId: data.orderID }),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({})) as { error?: string }
              setError(body.error ?? "Authorization failed")
              return
            }
            router.refresh()
          }}
          onError={(err) => {
            setError(err instanceof Error ? err.message : "PayPal error")
          }}
        />
      </PayPalScriptProvider>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

// ── Fit confirmation ───────────────────────────────────────────────────────────

type FitItem = { id: string; label_en: string }

export function FitConfirmPanel({
  orderId,
  fitItems,
  confirmedIds,
}: {
  orderId: string
  fitItems: FitItem[]
  confirmedIds: string[]
}) {
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set(confirmedIds))
  const [releasePending, startRelease] = useTransition()
  const router = useRouter()

  const [error, setError] = useState<string | null>(null)

  async function toggleItem(itemId: string) {
    if (confirmed.has(itemId)) return
    try {
      await safeFetch(`/api/orders/${orderId}/fit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      })
      setConfirmed((prev) => new Set([...prev, itemId]))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error")
    }
  }

  function releasePayment() {
    startRelease(async () => {
      try {
        await safeFetch(`/api/orders/${orderId}/release`, { method: "POST" })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error")
      }
    })
  }

  const allConfirmed = fitItems.every((item) => confirmed.has(item.id))

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Confirm each fit item. Payment will be released once all items are confirmed.
      </p>
      <ul className="space-y-2">
        {fitItems.map((item) => {
          const done = confirmed.has(item.id)
          return (
            <li key={item.id} className="flex items-center gap-3">
              <button
                onClick={() => toggleItem(item.id)}
                disabled={done}
                className={`h-5 w-5 shrink-0 rounded border-2 transition-colors ${
                  done
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-gray-300 hover:border-green-400"
                }`}
                aria-label={done ? "Confirmed" : "Confirm"}
              >
                {done && (
                  <svg viewBox="0 0 12 12" className="h-full w-full p-0.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </button>
              <span className={`text-sm ${done ? "text-gray-500 line-through" : "text-gray-800"}`}>
                {item.label_en}
              </span>
            </li>
          )
        })}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={releasePayment}
        disabled={!allConfirmed || releasePending}
        className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-green-700"
      >
        {releasePending ? "Releasing…" : "Release payment"}
      </button>
    </div>
  )
}
