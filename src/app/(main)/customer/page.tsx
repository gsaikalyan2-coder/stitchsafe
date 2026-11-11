import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/server/auth/auth"
import { customerSummary } from "@/server/services/dashboardService"
import {
  Clock,
  Package,
  ArrowRight,
  Inbox,
  MessageSquare,
} from "lucide-react"
import { PayPalEscrowShield } from "@/components/PayPalBrand"

const STATE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PROPOSED: "Proposed",
  AGREED: "Waiting for payment",
  AUTHORIZED: "Payment held",
  IN_PROGRESS: "Being made",
  SUBMITTED: "Photos submitted",
  CHECK_PASSED: "Check passed",
  CHECK_FAILED: "Check failed",
  SHIPPED: "Shipped — confirm fit",
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

export default async function CustomerPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const data = await customerSummary(session.user.id)
  const actionSet = new Set(data.actionNeeded.map((a) => a.orderId))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My orders</h1>
        <Link
          href="/orders/new"
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-light"
        >
          + New order
        </Link>
      </div>

      {/* Protection banner */}
      {data.totalHeldCents > 0 && (
        <PayPalEscrowShield amountFormatted={data.totalHeldFormatted} />
      )}

      {/* Empty state */}
      {data.orders.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <Inbox className="text-gray-300" size={48} />
          <p className="text-lg font-medium text-gray-500">No orders yet</p>
          <p className="text-sm text-gray-400">Your tailor will send you an order link.</p>
        </div>
      )}

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

      {/* Order cards */}
      {data.orders.length > 0 && (
        <ul className="space-y-3">
          {data.orders.map((order) => {
            const needsAction = actionSet.has(order.id)
            const actionItem = data.actionNeeded.find((a) => a.orderId === order.id)
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className={`group block rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                    needsAction ? "border-amber-200" : "border-gray-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {order.tailorName && !order.tailorName.toLowerCase().includes("demo")
                          ? order.tailorName
                          : "Sri Karthika Tailors"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_STYLE[order.state] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATE_LABEL[order.state] ?? order.state}
                        </span>
                        {order.dueDate && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={12} />
                            {new Date(order.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#0070BA] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          <MessageSquare size={11} /> Order Chat
                        </span>
                      </div>
                      {needsAction && actionItem && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          {actionItem.action}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-lg font-bold text-gray-900">${order.totalFormatted}</span>
                      {order.heldCents > 0 && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <Package size={12} /> Held
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
