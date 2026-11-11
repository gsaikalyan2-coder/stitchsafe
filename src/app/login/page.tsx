"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Scissors, ShieldCheck, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { PayPalLogo, PayPalMonogram } from "@/components/PayPalBrand";

function LoginForm() {
  const authError = useSearchParams().get("error");
  const [loadingRole, setLoadingRole] = useState<"TAILOR" | "CUSTOMER" | "PAYPAL" | null>(null);

  async function handleQuickLogin(role: "TAILOR" | "CUSTOMER") {
    setLoadingRole(role);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (res.ok && data.redirectTo) {
        window.location.href = data.redirectTo;
      } else {
        alert(data.message || "Failed to sign in");
        setLoadingRole(null);
      }
    } catch (err) {
      alert("Sign in error: " + (err instanceof Error ? err.message : String(err)));
      setLoadingRole(null);
    }
  }

  async function handlePayPalLogin() {
    setLoadingRole("PAYPAL");
    signIn("paypal", { callbackUrl: "/customer" });
  }

  return (
    <main className="min-h-screen bg-slate-50/70 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      {/* Platform Header */}
      <div className="max-w-4xl mx-auto w-full text-center space-y-4">
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs">
          <PayPalMonogram className="h-4 w-auto" />
          <span>PayPal Escrow Partner Platform • Cross-Border Bespoke Commerce</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Sign in to Stitch<span className="text-[#0070BA]">Safe</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto leading-relaxed">
            Choose your portal to manage bespoke commissions, review milestone specifications, and process escrow-protected payments.
          </p>
        </div>

        {authError && (
          <div className="max-w-md mx-auto mt-4 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700 font-medium">
            Authentication notice: {authError}
          </div>
        )}
      </div>

      {/* Dual Professional Enterprise Portals */}
      <div className="max-w-4xl mx-auto w-full my-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Portal 1: Tailor Partner Central (Merchant Studio) */}
        <div className="flex flex-col justify-between bg-white rounded-2xl border border-slate-200/90 p-7 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="h-11 w-11 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200">
                <Scissors size={20} />
              </div>
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                Tailor Partner Central
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">Sri Karthika Tailors</h2>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Merchant Studio Portal</p>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Workshop management portal. Receive bespoke commissions, provide itemized quotations, track tailoring stages, and verify completed garments.
              </p>
            </div>

            <div className="space-y-2.5 pt-1 text-xs text-slate-600 border-t border-slate-100 pt-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Guaranteed Escrow:</span>
                  <span className="text-slate-600"> Client funds pre-authorized in PayPal before cutting fabric</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Milestone Audit:</span>
                  <span className="text-slate-600"> Objective visual quality inspection against agreed client specifications</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Direct Settlement:</span>
                  <span className="text-slate-600"> Automatic disbursement to your merchant account upon fit approval</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-slate-100 space-y-2.5">
            <button
              onClick={() => handleQuickLogin("TAILOR")}
              disabled={loadingRole !== null}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-3 text-sm shadow-xs transition-colors disabled:opacity-50"
            >
              {loadingRole === "TAILOR" ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                <>
                  <span>Enter Tailor Studio</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-slate-400">
              Verified partner account: Sri Karthika Tailors
            </p>
          </div>
        </div>

        {/* Portal 2: Buyer Account Portal (Customer) */}
        <div className="flex flex-col justify-between bg-white rounded-2xl border border-slate-200/90 p-7 shadow-xs hover:shadow-md hover:border-[#0070BA]/50 transition-all duration-200">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="h-11 w-11 rounded-xl bg-blue-50 text-[#0070BA] flex items-center justify-center border border-blue-100">
                <ShieldCheck size={22} />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold uppercase tracking-wider border border-emerald-200">
                <Lock size={11} />
                <span>100% Escrow Protected</span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">Customer Buyer Portal</h2>
              <p className="text-xs font-semibold text-[#0070BA] mt-0.5">Protected by PayPal Escrow</p>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Commission bespoke bridal and festive garments from master artisans worldwide. Funds remain protected on hold until you try on and approve your outfit.
              </p>
            </div>

            <div className="space-y-2.5 pt-1 text-xs text-slate-600 border-t border-slate-100 pt-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">PayPal Hold Protection:</span>
                  <span className="text-slate-600"> Funds held securely with zero upfront disbursement</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Agreed Specifications:</span>
                  <span className="text-slate-600"> Full control over measurements, borders &amp; styling details</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">Live Order Chat:</span>
                  <span className="text-slate-600"> Communicate directly with your tailor for updates &amp; alterations</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-slate-100 space-y-2.5">
            <button
              onClick={handlePayPalLogin}
              disabled={loadingRole !== null}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#0070BA] hover:bg-[#003087] text-white font-bold px-5 py-3 text-sm shadow-xs transition-colors disabled:opacity-50"
            >
              {loadingRole === "PAYPAL" ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Connecting to PayPal…
                </span>
              ) : (
                <>
                  <PayPalMonogram className="h-4 w-auto brightness-200" />
                  <span>Log in with PayPal</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
            <button
              onClick={() => handleQuickLogin("CUSTOMER")}
              disabled={loadingRole !== null}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold px-4 py-2.5 text-xs border border-slate-200 transition-colors disabled:opacity-50"
            >
              {loadingRole === "CUSTOMER" ? "Loading Portal…" : "Quick Access as Priya Sundaram (Buyer Demo)"}
            </button>
          </div>
        </div>
      </div>

      {/* Enterprise Trust Footer */}
      <div className="max-w-4xl mx-auto w-full text-center space-y-3 pt-6 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <PayPalLogo className="h-4 w-auto" />
            <span>Commerce Platform Escrow</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Bilateral Milestone Verification</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <Lock size={14} className="text-slate-600" />
            <span>256-Bit TLS Security</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">
          StitchSafe secure commerce protocol protects bespoke fashion commissions between boutique master tailors in India and international clients worldwide.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading portals…</div>}>
      <LoginForm />
    </Suspense>
  );
}
