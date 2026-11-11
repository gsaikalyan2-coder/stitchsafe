import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/server/auth/auth"
import { tailorSummary } from "@/server/services/dashboardService"
import { formatCents } from "@/domain/pricing"
import {
  DollarSign,
  Package,
  CalendarClock,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle,
  Phone,
  CreditCard,
  MessageSquare,
} from "lucide-react"
import { PayPalVerifiedBadge, PayPalMonogram } from "@/components/PayPalBrand"

const STATE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PROPOSED: "Proposed",
  AGREED: "Waiting for payment",
  AUTHORIZED: "Payment held",
  IN_PROGRESS: "Being made",
  SUBMITTED: "Photos submitted",
  CHECK_PASSED: "Check passed",
  CHECK_FAILED: "Check failed",
  SHIPPED: "Shipped",
  RELEASED: "Released",
  CANCELLED: "Cancelled",
  VOIDED: "Voided",
  DISPUTED: "Disputed",
}

const STATE_STYLE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PROPOSED: "bg-blue-100 text-blue-700",
  AGREED: "bg-amber-100 text-amber-700",
  AUTHORIZED: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  SUBMITTED: "bg-purple-100 text-purple-700",
  CHECK_PASSED: "bg-emerald-100 text-emerald-700",
  CHECK_FAILED: "bg-rose-100 text-rose-700",
  SHIPPED: "bg-amber-100 text-amber-700",
  RELEASED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  VOIDED: "bg-gray-100 text-gray-500",
  DISPUTED: "bg-rose-100 text-rose-700",
}

export default async function TailorPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const data = await tailorSummary(session.user.id)

  const activeCount = data.orders.filter(
    (o) => !["RELEASED", "CANCELLED", "VOIDED"].includes(o.state),
  ).length
  const dueThisWeek = data.deadlineOrders.filter((d) => d.daysLeft <= 7 && d.daysLeft >= 0).length

  const stageOrder = [
    "Pending payment",
    "In progress",
    "Under check",
    "Delivered",
    "Released",
    "Closed",
    "Disputed",
  ] as const

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Tailor Central Workshop</h1>
            <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border border-amber-300">
              Seller Studio
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Sri Karthika Tailors • Verified PayPal Merchant Partner Studio
          </p>
        </div>
        <PayPalVerifiedBadge type="MERCHANT" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600">
            <div className="flex items-center gap-1.5">
              <PayPalMonogram className="h-4 w-auto" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">PayPal Held</span>
            </div>
            <DollarSign size={18} className="text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-black text-slate-900">${data.moneyOnHoldFormatted}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-600">
            <Package size={18} />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Active orders</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{activeCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600">
            <CalendarClock size={18} />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Due this week</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{dueThisWeek}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600">
            <TrendingUp size={18} />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">On-time %</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {data.trustBadges.onTimePct !== null ? `${data.trustBadges.onTimePct}%` : "—"}
          </p>
        </div>
      </div>

      {/* Trust profile */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${data.trustBadges.phoneVerified ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
          {data.trustBadges.phoneVerified ? <CheckCircle size={14} /> : <Phone size={14} />}
          Phone {data.trustBadges.phoneVerified ? "verified" : "not verified"}
        </span>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${data.trustBadges.paypalVerified ? "bg-blue-50 text-paypal" : "bg-gray-100 text-gray-400"}`}>
          <CreditCard size={14} />
          PayPal {data.trustBadges.paypalVerified ? "connected" : "not connected"}
        </span>
      </div>

      {/* Stage pills */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Orders by stage</h2>
        <div className="flex flex-wrap gap-2">
          {stageOrder.map((stage) => {
            const count = data.stageCounts[stage] ?? 0
            const isDisputed = stage === "Disputed"
            return (
              <span
                key={stage}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  count === 0
                    ? "border-gray-200 bg-gray-50 text-gray-400"
                    : isDisputed
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-indigo-200 bg-indigo-50 text-indigo-700"
                }`}
              >
                {stage}
                <span className="font-bold">{count}</span>
              </span>
            )
          })}
        </div>
      </section>

      {/* Action needed */}
      {data.actionNeeded.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Action needed</h2>
          <div className="space-y-2">
            {data.actionNeeded.map((item, i) => (
              <Link
                key={i}
                href={`/orders/${item.orderId}`}
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 transition-colors hover:bg-amber-100"
              >
                <span className="text-sm font-medium text-amber-900">{item.action}</span>
                <ArrowRight size={16} className="text-amber-600" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Deadlines */}
      {data.deadlineOrders.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Deadlines</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50/50 text-xs uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Customer</th>
                  <th className="px-5 py-3 text-left font-medium">Due</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.deadlineOrders.map((d) => (
                  <tr key={d.orderId} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {d.customerName && !d.customerName.toLowerCase().includes("demo")
                        ? d.customerName
                        : "Priya Sundaram"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(d.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      {d.overdue ? (
                        <span className="flex items-center gap-1 font-semibold text-rose-600">
                          <AlertTriangle size={14} /> Overdue
                        </span>
                      ) : d.daysLeft <= 2 ? (
                        <span className="flex items-center gap-1 font-semibold text-amber-600">
                          <Clock size={14} /> {d.daysLeft}d left
                        </span>
                      ) : (
                        <span className="text-gray-500">{d.daysLeft}d left</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/orders/${d.orderId}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* All orders */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">All orders</h2>
        {data.orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet. Create your first order above.</p>
        ) : (
          <ul className="space-y-3">
            {data.orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="group flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {o.customerName && !o.customerName.toLowerCase().includes("demo")
                        ? o.customerName
                        : "Priya Sundaram"}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLE[o.state] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATE_LABEL[o.state] ?? o.state}
                      </span>
                      {o.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock size={12} />
                          {new Date(o.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#0070BA] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        <MessageSquare size={11} /> Client Chat
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-lg font-bold text-gray-900">${formatCents(o.totalCents)}</span>
                    {o.hasLiveAddOn && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Revised
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
