"use client";

import React from "react";
import { ShieldCheck, Lock } from "lucide-react";

/**
 * Official PayPal Monogram SVG (Dual interlocking Ps)
 * Colors: Deep Blue (#003087) and Light Blue (#0070BA)
 */
export function PayPalMonogram({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Back P (Deep Navy) */}
      <path
        d="M25 15C25 6.71573 31.7157 0 40 0H72C87.464 0 100 12.536 100 28C100 42.668 88.6657 54.6853 74.3168 55.8828L63.5 110C63.2 111.5 61.8 112.5 60.2 112.5H41C39.1 112.5 37.6 110.8 38 108.9L44.5 76H30C27.2386 76 25 73.7614 25 71V15Z"
        fill="#003087"
      />
      {/* Front P (Bright Blue) */}
      <path
        d="M15 35C15 26.7157 21.7157 20 30 20H62C77.464 20 90 32.536 90 48C90 62.668 78.6657 74.6853 64.3168 75.8828L55 120H37C35.1 120 33.6 118.3 34 116.4L40.5 83.5H25C22.2386 83.5 20 81.2614 20 78.5L20 40C20 37.2386 17.7614 35 15 35Z"
        fill="#0070BA"
      />
      {/* Overlapping intersection */}
      <path
        d="M40.5 83.5L44.5 76H64C72.5 76 79.5 71 83 64C80 71 72.5 75.8828 64.3168 75.8828L55 120H37C35.1 120 33.6 118.3 34 116.4L40.5 83.5Z"
        fill="#002244"
        opacity="0.3"
      />
    </svg>
  );
}

/**
 * Full PayPal Wordmark + Monogram
 */
export function PayPalLogo({
  className = "h-6 w-auto",
  monogramOnly = false,
}: {
  className?: string;
  monogramOnly?: boolean;
}) {
  if (monogramOnly) {
    return <PayPalMonogram className={className} />;
  }

  return (
    <div className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <PayPalMonogram className="h-5 w-auto" />
      <span className="font-extrabold tracking-tight text-[#003087] text-lg leading-none">
        Pay<span className="text-[#0070BA]">Pal</span>
      </span>
    </div>
  );
}

/**
 * Official PayPal Escrow Trust Banner
 */
export function PayPalEscrowShield({
  amountFormatted,
  tailorName,
}: {
  amountFormatted?: string;
  tailorName?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-[#0070BA]/30 bg-gradient-to-r from-[#003087]/5 via-[#0070BA]/10 to-emerald-50/50 p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center shrink-0">
            <PayPalMonogram className="h-5 w-auto" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm tracking-tight text-[#003087]">
                PayPal <span className="text-[#0070BA]">Escrow Protection</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <ShieldCheck size={11} /> 100% Guaranteed
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Authorized via PayPal REST Platform • Funds reserved under sandbox hold
            </p>
          </div>
        </div>

        {amountFormatted && (
          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Protected Amount
            </span>
            <span className="text-lg font-black text-[#003087]">${amountFormatted} USD</span>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <Lock size={12} className="text-[#0070BA]" />
          <span>
            {tailorName ? (
              <>
                <strong>{tailorName}</strong> cannot withdraw or claim funds until you confirm the garment fit.
              </>
            ) : (
              "Funds are never released to the tailor until the finished fit is verified."
            )}
          </span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">INTENT: AUTHORIZE</span>
      </div>
    </div>
  );
}

/**
 * PayPal Verified Badge for Header or Cards
 */
export function PayPalVerifiedBadge({
  type = "BUYER",
}: {
  type?: "BUYER" | "MERCHANT";
}) {
  const isMerchant = type === "MERCHANT";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-xs ${
        isMerchant
          ? "bg-[#003087]/10 text-[#003087] border border-[#003087]/20"
          : "bg-[#0070BA]/10 text-[#0070BA] border border-[#0070BA]/20"
      }`}
      title={isMerchant ? "Verified PayPal Business Merchant" : "PayPal Verified Buyer"}
    >
      <PayPalMonogram className="h-3.5 w-auto" />
      <span>{isMerchant ? "PayPal Verified Merchant" : "PayPal Verified Buyer"}</span>
    </span>
  );
}

