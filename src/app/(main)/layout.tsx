"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Scissors, LogOut, ArrowRightLeft, PlusCircle } from "lucide-react";
import { PayPalLogo, PayPalMonogram, PayPalVerifiedBadge } from "@/components/PayPalBrand";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const isTailor = user?.role === "TAILOR";
  const [switching, setSwitching] = useState(false);

  const displayName = user?.name && !user.name.toLowerCase().includes("demo")
    ? user.name
    : isTailor
      ? "Sri Karthika Tailors"
      : "Priya Sundaram";

  const homeHref = isTailor ? "/tailor" : "/customer";

  async function handleSwitchRole(targetRole: "TAILOR" | "CUSTOMER") {
    if (switching) return;
    setSwitching(true);
    try {
      await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      if (pathname.startsWith("/orders/")) {
        window.location.reload();
      } else {
        window.location.href = targetRole === "TAILOR" ? "/tailor" : "/customer";
      }
    } catch {
      setSwitching(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      {/* Top Banner (Amazon-style trust banner) */}
      <div className="bg-gradient-to-r from-[#003087] via-[#0070BA] to-slate-900 text-white text-xs py-1.5 px-4 sm:px-8">
        <div className="mx-auto max-w-[1720px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PayPalMonogram className="h-3.5 w-auto" />
            <span className="font-medium tracking-wide">
              Official PayPal Commerce Platform Escrow • Cross-Border USD Settlement
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11px] text-white/80">
            <span>Deterministic Escrow Hold Protocol</span>
            <span>•</span>
            <span>Milestone Quality Verification</span>
          </div>
        </div>
      </div>

      {/* Main App Navigation (Distinct for Tailor vs Customer) */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex w-full max-w-[1720px] items-center justify-between px-4 sm:px-8 xl:px-12 py-3.5">
          {/* Logo & Portal Branding */}
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href={homeHref} className="flex items-center gap-3 group">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-sm transition-transform group-hover:scale-105 ${
                  isTailor ? "bg-slate-900" : "bg-[#0070BA]"
                }`}
              >
                <Scissors size={20} className={isTailor ? "text-amber-400" : "text-white"} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight text-slate-900">
                    Stitch<span className={isTailor ? "text-amber-600" : "text-[#0070BA]"}>Safe</span>
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                      isTailor
                        ? "bg-amber-50 text-amber-900 border-amber-300"
                        : "bg-blue-50 text-[#003087] border-blue-200"
                    }`}
                  >
                    {isTailor ? "Tailor Central" : "Buyer Portal"}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <PayPalLogo className="h-3.5 w-auto" />
                  <span className="text-slate-400">•</span>
                  <span>{isTailor ? "Verified Merchant Partner" : "Protected Escrow Shopping"}</span>
                </p>
              </div>
            </Link>

            {/* Role-Specific Navigation Links (No generic [Customer | Tailor] toggle) */}
            <nav className="hidden lg:flex items-center gap-1 pl-4 border-l border-slate-200">
              {isTailor ? (
                <>
                  <Link
                    href="/tailor"
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                      pathname === "/tailor"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    Workshop Orders
                  </Link>
                  <span className="text-slate-300 px-1">•</span>
                  <span className="text-xs font-medium text-slate-500">
                    Active Commissions &amp; Payouts
                  </span>
                </>
              ) : (
                <>
                  <Link
                    href="/customer"
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                      pathname === "/customer"
                        ? "bg-[#0070BA] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    My Orders
                  </Link>
                  <Link
                    href="/orders/new"
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                      pathname === "/orders/new"
                        ? "bg-[#0070BA] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <PlusCircle size={14} />
                    <span>Commission New Garment</span>
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* User Profile, Verification & Actions */}
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="hidden sm:flex items-center gap-2.5">
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900">{displayName}</p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {isTailor ? "Master Tailor & Designer" : "Verified Garment Client"}
                    </p>
                  </div>
                  <PayPalVerifiedBadge type={isTailor ? "MERCHANT" : "BUYER"} />
                </div>

                {/* Professional Quick Portal Switcher (For Demo & Multi-Role) */}
                <button
                  type="button"
                  onClick={() => handleSwitchRole(isTailor ? "CUSTOMER" : "TAILOR")}
                  disabled={switching}
                  className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isTailor
                      ? "bg-blue-50 text-[#003087] border-blue-200 hover:bg-blue-100"
                      : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                  } disabled:opacity-50`}
                  title={isTailor ? "Switch to Buyer View (Priya)" : "Switch to Tailor Studio (Sri Karthika)"}
                >
                  <ArrowRightLeft size={13} className={switching ? "animate-spin" : ""} />
                  <span>
                    {switching
                      ? "Switching…"
                      : isTailor
                        ? "View Buyer Portal"
                        : "View Tailor Central"}
                  </span>
                </button>

                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  title="Sign out"
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Canvas */}
      <main className="flex-1 mx-auto w-full max-w-[1720px] px-4 sm:px-8 xl:px-12 py-8">
        {children}
      </main>
    </div>
  );
}
