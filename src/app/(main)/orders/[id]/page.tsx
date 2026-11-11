import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/server/auth/auth"
import { getOrder, getOrderEvents } from "@/server/services/orderService"
import { formatCents } from "@/domain/pricing"
import type { ChecklistItem } from "@/server/ai/schemas"
import {
  DisputeButton,
  CancelOrderButton,
  ChangeRequestForm,
  ChangeRequestsManager,
  ResolveFailedChecks,
  FitConfirmPanel,
  PayPalPayButton,
} from "./OrderActions"
import { ChecklistEditor } from "./ChecklistEditor"
import { OrderChat } from "./OrderChat"
import { TailorControls } from "./TailorControls"
import { OrderStageNavigator } from "./OrderStageNavigator"
import { ShieldCheck, Calendar, ArrowLeft, Camera, FileCheck, MessageSquare } from "lucide-react"
import { PayPalEscrowShield, PayPalMonogram, PayPalVerifiedBadge } from "@/components/PayPalBrand"

export const runtime = "nodejs"

// ── State chip ─────────────────────────────────────────────────────────────────

function StateChip({ state }: { state: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
    PROPOSED: "bg-blue-50 text-blue-700 border-blue-200",
    AGREED: "bg-amber-50 text-amber-700 border-amber-200",
    AUTHORIZED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    IN_PROGRESS: "bg-indigo-50 text-indigo-700 border-indigo-200",
    SUBMITTED: "bg-purple-50 text-purple-700 border-purple-200",
    CHECK_PASSED: "bg-emerald-50 text-emerald-800 border-emerald-300",
    CHECK_FAILED: "bg-rose-50 text-rose-700 border-rose-200",
    SHIPPED: "bg-amber-50 text-amber-800 border-amber-300",
    RELEASED: "bg-emerald-100 text-emerald-900 border-emerald-300",
    CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
    VOIDED: "bg-slate-100 text-slate-500 border-slate-200",
    DISPUTED: "bg-rose-50 text-rose-800 border-rose-300",
  }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${map[state] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {state.replace(/_/g, " ")}
    </span>
  )
}

// ── Event type → plain English ─────────────────────────────────────────────────

function eventLabel(type: string, note?: string | null): string {
  const labels: Record<string, string> = {
    ORDER_CREATED: "Order request created by customer",
    CHECKLIST_BUILT: "AI extracted tailoring specifications",
    CHECKLIST_EDITED: "Checklist specifications customized",
    SENT_TO_TAILOR: "Checklist submitted to tailor for proposal",
    CHECKLIST_ACCEPTED: "Checklist & pricing accepted",
    PRICE_LINES_SET: "Prices set by tailor",
    STATE_CHANGE: "Status updated",
    PAYPAL_AUTHORIZED: "Payment hold authorized via PayPal",
    ADDON_AUTHORIZED: "Add-on payment authorized",
    PAYPAL_CAPTURED: "Payment released & captured",
    PAYPAL_VOIDED: "Payment hold voided",
    PAYPAL_REAUTHORIZED: "Payment hold re-authorized",
    CHANGE_REQUESTED: "Customer requested a design/scope change",
    CHANGE_PRICED: "Tailor submitted price for change request",
    CHANGE_ACCEPTED: "Change accepted & added to order",
    PROGRESS_NOTE: note ? `Tailor update: ${note}` : "Tailor progress note posted",
    PHOTO_CHECK_PASSED: "Finished outfit passed AI vision check",
    PHOTO_CHECK_FAILED: "Finished outfit needs adjustments",
    PHOTOS_REJECTED_UNRELATED: "Photo rejected — not related to this garment",
    FIT_CONFIRMED: "Customer confirmed measurement & fit",
    ACCEPT_ANYWAY: "Customer approved garment despite AI flag",
    DISPUTED: "Problem reported — order in dispute",
  }
  return labels[type] ?? type.replace(/_/g, " ").toLowerCase()
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const userId = session.user.id
  const order = await getOrder(orderId, userId)
  const events = await getOrderEvents(orderId, userId)

  const isCustomer = userId === order.customerId
  const isTailor = userId === order.tailorId

  // Format realistic names
  const tailorName =
    order.tailor.name && !order.tailor.name.includes("Demo")
      ? order.tailor.name
      : "Sri Karthika Tailors"
  const customerName =
    order.customer.name && !order.customer.name.includes("Demo")
      ? order.customer.name
      : "Priya Sundaram"
  const otherPartyName = isCustomer ? tailorName : customerName

  // ── Checklist ───────────────────────────────────────────────────────────────
  const latestCV = order.checklistVersions[0]
  const checklistItems = latestCV
    ? (latestCV.items as unknown as ChecklistItem[])
    : []
  const customerAccepted = latestCV?.customerAcceptedAt != null

  // ── Price lines ─────────────────────────────────────────────────────────────
  const baseLines = order.priceLines.filter((l) => l.changeRequestId === null)
  const addOnLines = order.priceLines.filter((l) => l.changeRequestId !== null)
  const totalHeld = order.payments
    .filter((p) => p.status === "AUTHORIZED")
    .reduce((s, p) => s + p.amountCents, 0)

  // ── Photo verdicts (from last check event) ─────────────────────────────────
  const checkEvent = events.find(
    (e) => e.type === "PHOTO_CHECK_PASSED" || e.type === "PHOTO_CHECK_FAILED",
  )
  const verdicts = checkEvent?.payload
    ? ((checkEvent.payload as {
        verdicts?: Array<{
          itemId: string
          verdict: string
          fixHint?: string
          evidence?: string
          feedbackForTailor?: string
        }>
      }).verdicts ?? [])
    : []

  // Photos
  const referencePhotos = order.photos.filter((p) => p.kind === "REFERENCE")
  const finishedPhotos = order.photos.filter((p) => p.kind === "FINISHED")

  // ── Fit items ───────────────────────────────────────────────────────────────
  const fitItems = checklistItems.filter((i) => i.checkMethod === "fit")
  const confirmedFitIds = order.fitConfirmations.map((fc) => fc.itemId)

  // ── Cancellable / Disputable states ─────────────────────────────────────────
  const cancellableStates = new Set(["DRAFT", "PROPOSED", "AGREED", "AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "CHECK_FAILED", "CHECK_PASSED"])
  const canCancel = isCustomer && cancellableStates.has(order.state)

  const disputableStates = new Set(["AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "CHECK_FAILED", "CHECK_PASSED", "SHIPPED"])
  const canDispute = isCustomer && disputableStates.has(order.state)

  // Status stepper
  const steps = [
    { key: "DRAFT", label: "Draft Specs" },
    { key: "PROPOSED", label: "Tailor Pricing" },
    { key: "AGREED", label: "Agreed" },
    { key: "AUTHORIZED", label: "Payment Held" },
    { key: "IN_PROGRESS", label: "Stitching" },
    { key: "SUBMITTED", label: "Photo Check" },
    { key: "CHECK", label: order.state === "CHECK_FAILED" ? "Check Alert" : "Check Passed" },
    { key: "SHIPPED", label: "Dispatched" },
    { key: "RELEASED", label: "Fit Released" },
  ]
  const stateIdx: Record<string, number> = {
    DRAFT: 0, PROPOSED: 1, AGREED: 2, AUTHORIZED: 3, IN_PROGRESS: 4,
    SUBMITTED: 5, CHECK_PASSED: 6, CHECK_FAILED: 6, SHIPPED: 7, RELEASED: 8,
    CANCELLED: -1, VOIDED: -1, DISPUTED: -1,
  }
  const currentIdx = stateIdx[order.state] ?? -1
  const backHref = isCustomer ? "/customer" : "/tailor"

  return (
    <div className="w-full mx-auto space-y-6 pb-16">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to {isCustomer ? "Customer Dashboard" : "Tailor Studio"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Bespoke Order: <span className="text-emerald-800">{isCustomer ? tailorName : customerName}</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
            <span className="font-mono">Order ID: #{orderId.slice(-8)}</span>
            {order.dueDate && (
              <span className="flex items-center gap-1 text-slate-600">
                <Calendar size={13} className="text-emerald-700" />
                Target Due Date: {new Date(order.dueDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#chat-section"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition-all"
            >
              <MessageSquare size={13} className="text-emerald-400" />
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Open Chat</span>
            </a>
            <PayPalVerifiedBadge type={isTailor ? "MERCHANT" : "BUYER"} />
            <StateChip state={order.state} />
          </div>
          {totalHeld > 0 && (
            <span className="text-xs font-bold text-[#0070BA] flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              <PayPalMonogram className="h-3.5 w-auto" />
              <span>${formatCents(totalHeld)} USD held in PayPal escrow</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress Stepper (Occupies overall width smoothly) */}
      {currentIdx >= 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm scrollbar-none">
          <div className="flex items-center justify-between gap-1.5 min-w-max w-full">
            {steps.map((step, i) => {
              const done = i < currentIdx
              const active = i === currentIdx
              return (
                <div key={step.key} className="flex items-center gap-1.5 flex-1 justify-center last:flex-none">
                  <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? "bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10"
                      : done
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-400"
                  }`}>
                    {done && <span className="text-emerald-600 font-bold">✓</span>}
                    {step.label}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 min-w-3 ${done ? "bg-emerald-500" : "bg-slate-200"}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Interactive Next Step Stage Navigator (Guidance & One-Click Advance) */}
      <OrderStageNavigator
        orderId={orderId}
        state={order.state}
        isCustomer={isCustomer}
        isTailor={isTailor}
        totalCents={order.totalCents}
        tailorName={tailorName}
        customerName={customerName}
      />

      {/* Main 2-Column Responsive Layout (Full Screen Utilization) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
        {/* Left Column (7 of 12 cols on lg, 8 on 2xl): Specifications, Alterations, Verification */}
        <div className="lg:col-span-7 xl:col-span-7 2xl:col-span-8 space-y-6">
          {/* Official PayPal Escrow Trust Banner */}
          {["AUTHORIZED", "IN_PROGRESS", "SUBMITTED", "CHECK_PASSED", "SHIPPED"].includes(order.state) && (
            isCustomer ? (
              <PayPalEscrowShield
                amountFormatted={formatCents(totalHeld > 0 ? totalHeld : order.totalCents)}
                tailorName={tailorName}
              />
            ) : (
              <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 text-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                      <PayPalMonogram className="h-5 w-auto" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">PayPal Merchant Escrow Payout Guaranteed</h4>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Reserved
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Client payment is secured in PayPal escrow. Funds transfer directly to your merchant account upon customer fit approval.
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Held Payout
                    </span>
                    <span className="text-lg font-black text-amber-400 font-mono">
                      ${formatCents(totalHeld > 0 ? totalHeld : order.totalCents)} USD
                    </span>
                  </div>
                </div>
              </div>
            )
          )}

          {/* 1. Checklist Specifications with Customer Edit & Bilateral Acceptance */}
          <ChecklistEditor
            orderId={orderId}
            initialItems={checklistItems}
            isCustomer={isCustomer}
            orderState={order.state}
            customerAccepted={customerAccepted}
            versionId={latestCV?.id}
          />

          {/* 2. Reference & Finished Work Photo Gallery */}
          {(referencePhotos.length > 0 || finishedPhotos.length > 0) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Camera size={16} className="text-emerald-700" />
                  <span>Garment Photo Records</span>
                </h2>
                <span className="text-xs text-slate-400">
                  {referencePhotos.length} Reference • {finishedPhotos.length} Finished
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Reference Photos */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
                    Customer Reference Inspiration
                  </span>
                  {referencePhotos.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No reference photos uploaded.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {referencePhotos.map((p, idx) => (
                        <div key={p.id} className="relative aspect-square rounded-xl bg-slate-100 border border-slate-200 overflow-hidden group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/photos?path=${encodeURIComponent(p.storagePath)}`}
                            alt={`Reference inspiration ${idx + 1}`}
                            className="object-cover w-full h-full"
                          />
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium backdrop-blur-xs">
                            Ref {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Finished Work Photos */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block">
                    Tailor Finished Craftsmanship
                  </span>
                  {finishedPhotos.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      Tailor will upload photos prior to shipping.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {finishedPhotos.map((p, idx) => (
                        <div key={p.id} className="relative aspect-square rounded-xl bg-emerald-50 border border-emerald-200 overflow-hidden group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/photos?path=${encodeURIComponent(p.storagePath)}`}
                            alt={`Finished garment photo ${idx + 1}`}
                            className="object-cover w-full h-full"
                          />
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-200 text-[10px] font-bold backdrop-blur-xs">
                            Round {p.round + 1} • #{idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 3. Tailor Controls Workspace (When Tailor is logged in) */}
          {isTailor && (
            <TailorControls
              orderId={orderId}
              state={order.state}
              checkRound={order.checkRound}
              needsManualReview={order.needsManualReview}
              priceLines={order.priceLines.map((l) => ({
                id: l.id,
                kind: l.kind as "BASE" | "RUSH" | "SHIPPING" | "CUSTOMS" | "ADDON",
                label: l.label,
                amountCents: l.amountCents,
              }))}
              checklistItems={checklistItems.map((i) => ({
                id: i.id,
                label_en: i.label_en,
                checkMethod: i.checkMethod,
              }))}
              verifyItems={verdicts.map((v) => ({
                itemId: v.itemId,
                verdict: v.verdict as "MET" | "PARTLY_MET" | "NOT_MET" | "UNCHECKED",
                fixNote: v.feedbackForTailor || v.evidence || v.fixHint || null,
              }))}
              hasChecklist={checklistItems.length > 0}
              changeRequests={order.changeRequests}
            />
          )}

          {/* 4. Customer PayPal Payment Hold Authorization */}
          {isCustomer && order.state === "AGREED" && (
            <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-emerald-950">
                    Authorize Payment Hold (${formatCents(order.totalCents)} USD)
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Your money is placed on hold by PayPal. Sri Karthika Tailors cannot claim funds until you confirm the fit.
                  </p>
                </div>
              </div>
              <PayPalPayButton orderId={orderId} />
            </section>
          )}

          {/* 5. Customer Fit Confirmation & Release Gate */}
          {isCustomer && order.state === "SHIPPED" && fitItems.length > 0 && (
            <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-emerald-700" />
                <h2 className="text-sm font-bold text-emerald-950">Try on Garment &amp; Confirm Fit</h2>
              </div>
              <FitConfirmPanel
                orderId={orderId}
                fitItems={fitItems.map((i) => ({ id: i.id, label_en: i.label_en }))}
                confirmedIds={confirmedFitIds}
              />
            </section>
          )}

          {/* 6. Scope Changes & Alterations (Accept / Reject) */}
          {order.changeRequests.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Scope Alterations &amp; Change Requests</h2>
                <span className="text-xs text-slate-400 font-medium">{order.changeRequests.length} recorded</span>
              </div>
              <ChangeRequestsManager
                orderId={orderId}
                changeRequests={order.changeRequests.map((cr) => ({
                  id: cr.id,
                  changeDiff: cr.changeDiff,
                  status: cr.status,
                  priceLines: cr.priceLines.map((l) => ({
                    id: l.id,
                    label: l.label,
                    amountCents: l.amountCents,
                  })),
                  createdAt: cr.createdAt,
                }))}
                isCustomer={isCustomer}
              />
            </section>
          )}

          {/* 7. Customer Change Request Assistant */}
          {isCustomer && ["AUTHORIZED", "IN_PROGRESS", "CHECK_FAILED"].includes(order.state) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Request Alteration or Scope Change</h2>
                <span className="text-xs text-slate-400">Custom alteration flow</span>
              </div>
              <ChangeRequestForm orderId={orderId} />
            </section>
          )}

          {/* 8. Failed Checks Resolution (after 2 rounds) */}
          {isCustomer && order.state === "CHECK_FAILED" && order.checkRound >= 2 && (
            <ResolveFailedChecks orderId={orderId} />
          )}

          {/* 9. Bottom Side Exits: Dispute or Cancel */}
          {isCustomer && (canDispute || canCancel) && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <span className="text-xs text-slate-500">Need to cancel or report an issue?</span>
              <div className="flex gap-2">
                {canDispute && <DisputeButton orderId={orderId} />}
                {canCancel && <CancelOrderButton orderId={orderId} />}
              </div>
            </div>
          )}

          {/* Released Receipt Banner */}
          {order.state === "RELEASED" && (
            <div className="rounded-2xl bg-emerald-100/70 border border-emerald-300 p-5 text-sm text-emerald-900 flex items-center justify-between">
              <div>
                <p className="font-bold">Payment Released to Sri Karthika Tailors</p>
                <p className="text-xs text-emerald-700 mt-0.5">Garment fit confirmed and approved.</p>
              </div>
              <Link
                href={`/orders/${orderId}/receipt`}
                className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-semibold hover:bg-emerald-900 transition-colors shadow-sm"
              >
                View Official Receipt
              </Link>
            </div>
          )}
        </div>

        {/* Right Column (5 of 12 cols on lg, 4 on 2xl): Live Chat, Price Breakdown, Event Log */}
        <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 space-y-6">
          {/* 1. Real-time Order Chat Component (Top of column for instant visibility) */}
          <div id="chat-section">
            <OrderChat
              orderId={orderId}
              currentUserId={userId}
              otherPartyName={otherPartyName}
              isTailor={isTailor}
            />
          </div>

          {/* 2. Price Breakdown Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Price Breakdown</h2>
            {baseLines.length === 0 ? (
              <p className="text-xs text-slate-400">Tailor has not yet set price lines.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {baseLines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-slate-600 font-medium">{line.label}</td>
                      <td className="py-2 text-right font-semibold text-slate-800">${formatCents(line.amountCents)}</td>
                    </tr>
                  ))}
                  {addOnLines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 text-slate-600 font-medium">{line.label} <span className="text-[10px] text-purple-600 font-bold">(add-on)</span></td>
                      <td className="py-2 text-right font-semibold text-slate-800">${formatCents(line.amountCents)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-bold text-sm">
                    <td className="pt-2.5 text-slate-900">Total Agreed</td>
                    <td className="pt-2.5 text-right text-emerald-800">${formatCents(order.totalCents)} USD</td>
                  </tr>
                  {totalHeld > 0 && (
                    <tr>
                      <td className="pt-1 text-[11px] text-emerald-700">Held by PayPal</td>
                      <td className="pt-1 text-right text-[11px] text-emerald-700 font-semibold">${formatCents(totalHeld)} USD</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </section>

          {/* Audit Event Timeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit Timeline</h2>
            <ol className="space-y-2.5 text-xs">
              {events.slice(0, 8).map((ev) => (
                <li key={ev.id} className="flex gap-2.5">
                  <span className="shrink-0 text-slate-400 tabular-nums text-[11px] pt-0.5">
                    {new Date(ev.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-slate-700 leading-snug">{eventLabel(ev.type, ev.note)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
