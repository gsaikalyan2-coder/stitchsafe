import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/server/auth/auth"
import { getOrder } from "@/server/services/orderService"
import { formatCents } from "@/domain/pricing"
import { prisma } from "@/server/db"
import { ShieldCheck, CheckCircle2, ArrowLeft } from "lucide-react"
import { PayPalLogo } from "@/components/PayPalBrand"

export const runtime = "nodejs"

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/api/auth/signin")

  const order = await getOrder(orderId, session.user.id)
  const tailorName =
    order.tailor.name && !order.tailor.name.toLowerCase().includes("demo")
      ? order.tailor.name
      : "Sri Karthika Tailors"
  const customerName =
    order.customer.name && !order.customer.name.toLowerCase().includes("demo")
      ? order.customer.name
      : "Priya Sundaram"

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <Link
          href={`/orders/${orderId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 transition-colors"
        >
          <ArrowLeft size={14} /> Back to order
        </Link>
        <span className="text-xs text-slate-400 font-mono">ORDER #{orderId.slice(0, 8).toUpperCase()}</span>
      </div>

      {order.state !== "RELEASED" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <ShieldCheck size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Receipt Not Yet Generated</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Official receipt is finalized once garment fit is confirmed and funds are released to {tailorName}.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-8">
          {/* Header */}
          <div className="border-b border-slate-100 pb-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <PayPalLogo className="h-5 w-auto" />
                <span className="text-slate-300">•</span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Official Payment Receipt</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900">StitchSafe Escrow Settlement</h1>
              <p className="text-xs text-slate-400 mt-0.5">Automated release via PayPal REST API • Funds transferred to merchant</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                <CheckCircle2 size={13} /> Paid &amp; Released
              </span>
            </div>
          </div>

          {/* Party details */}
          <div className="grid grid-cols-2 gap-6 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</span>
              <p className="font-bold text-slate-900 text-sm">{customerName}</p>
              <p className="text-slate-500">{order.customer.email}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Master Tailor</span>
              <p className="font-bold text-slate-900 text-sm">{tailorName}</p>
              <p className="text-slate-500">{order.tailor.email}</p>
            </div>
          </div>

          {/* Price Breakdown */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Order Items</h2>
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.priceLines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 font-medium text-slate-700">{line.label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">${formatCents(line.amountCents)}</td>
                    </tr>
                  ))}
                  <tr className="bg-emerald-50/50">
                    <td className="px-4 py-3 font-bold text-emerald-950">Total Paid (USD)</td>
                    <td className="px-4 py-3 text-right font-black text-emerald-950 text-sm">${formatCents(order.totalCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Payment Lifecycle History */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Payment Audit Trail</h2>
            <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50/50">
              <PaymentHistory orderId={orderId} />
            </div>
          </section>

          {/* Escrow Guarantee footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>Full escrow cycle completed securely via PayPal sandbox integration.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function PaymentHistory({ orderId }: { orderId: string }) {
  const payments = await prisma.payment.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  })

  const rows: Array<{ date: Date; action: string; amount: number; ref: string | null }> = []
  for (const p of payments) {
    if (p.authorizedAt) {
      rows.push({ date: p.authorizedAt, action: "PayPal Hold Authorized", amount: p.amountCents, ref: p.paypalAuthorizationId })
    }
    if (p.capturedAt) {
      rows.push({ date: p.capturedAt, action: "Escrow Captured & Released", amount: p.amountCents, ref: p.paypalCaptureId })
    }
    if (p.voidedAt) {
      rows.push({ date: p.voidedAt, action: "Hold Voided / Cancelled", amount: p.amountCents, ref: p.paypalAuthorizationId })
    }
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime())

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400">No payment records.</p>
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">
          <th className="pb-2 text-left font-semibold">Timestamp</th>
          <th className="pb-2 text-left font-semibold">Lifecycle Event</th>
          <th className="pb-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row, i) => (
          <tr key={i}>
            <td className="py-2 text-slate-500 font-mono text-[11px]">
              {row.date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
            </td>
            <td className="py-2 text-slate-800 font-medium">
              {row.action}
              {row.ref && (
                <span className="ml-1.5 text-[10px] text-slate-400 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {row.ref.slice(0, 14)}…
                </span>
              )}
            </td>
            <td className="py-2 text-right font-bold text-slate-900">${formatCents(row.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
