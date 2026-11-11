"use client";

import { useState } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";

interface Props {
  orderId: string;
  state: string;
  isCustomer: boolean;
  isTailor: boolean;
  totalCents: number;
  tailorName: string;
  customerName: string;
}

export function OrderStageNavigator({
  orderId,
  state,
  isCustomer,
  tailorName,
  customerName,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitchRole(targetRole: "TAILOR" | "CUSTOMER") {
    if (switching) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setSwitching(false);
      }
    } catch {
      setSwitching(false);
    }
  }

  async function handleAdvance() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/advance`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to advance");
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  const nextStepMap: Record<string, { next: string; actor: string }> = {
    DRAFT: { next: "Tailor Pricing", actor: tailorName },
    PROPOSED: { next: "Accept Proposal", actor: customerName },
    AGREED: { next: "Escrow Payment", actor: customerName },
    AUTHORIZED: { next: "Start Stitching", actor: tailorName },
    IN_PROGRESS: { next: "Photo Quality Check", actor: tailorName },
    CHECK_PASSED: { next: "Ship Order", actor: tailorName },
    SHIPPED: { next: "Confirm Fit & Release", actor: customerName },
    RELEASED: { next: "Completed", actor: "Settled" },
  };

  const current = nextStepMap[state];
  if (!current || state === "RELEASED") return null;

  const targetRole = isCustomer ? "TAILOR" : "CUSTOMER";
  const targetLabel = isCustomer ? "Switch to Tailor" : "Switch to Buyer";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-xs">
      <div className="flex items-center gap-2.5 text-xs">
        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">
          Next Step:
        </span>
        <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
          {current.next}
        </span>
        <span className="text-slate-300">•</span>
        <span className="text-slate-500 font-medium">{current.actor}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {error && <span className="text-xs text-rose-600 font-medium">{error}</span>}
        <button
          type="button"
          onClick={() => handleSwitchRole(targetRole)}
          disabled={switching}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50"
        >
          <ArrowRightLeft size={12} className={switching ? "animate-spin" : "text-slate-400"} />
          <span>{switching ? "Switching…" : targetLabel}</span>
        </button>
        <button
          type="button"
          onClick={handleAdvance}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs active:scale-[0.99] disabled:opacity-50"
        >
          {loading ? (
            <span>Updating…</span>
          ) : (
            <>
              <span>Next</span>
              <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
