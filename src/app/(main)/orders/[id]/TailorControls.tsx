"use client";

import { useState } from "react";
import { Scissors, Upload, Clock, Send, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

type PriceLineKind = "BASE" | "RUSH" | "SHIPPING" | "CUSTOMS" | "ADDON";

type PriceLine = {
  id: string;
  kind: PriceLineKind;
  label: string;
  amountCents: number;
};

type ChecklistItem = {
  id: string;
  label_en: string;
  checkMethod: "photo" | "fit";
};

type VerifyItem = {
  itemId: string;
  verdict: "MET" | "PARTLY_MET" | "NOT_MET" | "UNCHECKED";
  fixNote: string | null;
};

type ChangeRequest = {
  id: string;
  status: string;
  changeDiff: unknown;
  priceLines: Array<{ id: string; label: string; amountCents: number }>;
};

type Props = {
  orderId: string;
  state: string;
  checkRound: number;
  needsManualReview: boolean;
  priceLines: PriceLine[];
  checklistItems: ChecklistItem[];
  verifyItems: VerifyItem[];
  hasChecklist: boolean;
  changeRequests?: ChangeRequest[];
};

const KIND_OPTIONS: PriceLineKind[] = ["BASE", "RUSH", "SHIPPING", "CUSTOMS", "ADDON"];

export function TailorControls({
  orderId,
  state,
  checkRound,
  needsManualReview,
  priceLines: _priceLines,
  checklistItems,
  verifyItems,
  hasChecklist,
  changeRequests = [],
}: Props) {
  // Build checklist state
  const [buildingChecklist, setBuildingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  // Price-line editor state
  const [lines, setLines] = useState<Array<Omit<PriceLine, "id">>>([
    { kind: "BASE", label: "Custom Tailoring & Stitching", amountCents: 6500 },
    { kind: "SHIPPING", label: "Standard Insured Shipping", amountCents: 1500 },
  ]);
  const [priceSubmitting, setPriceSubmitting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Propose state
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  // Progress note state
  const [noteText, setNoteText] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState(false);

  // Photo upload state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Recheck state
  const [recheckSubmitting, setRecheckSubmitting] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  // Ship / Start state
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Change request pricing state
  const [changePricingId, setChangePricingId] = useState<string | null>(null);
  const [changePriceLabel, setChangePriceLabel] = useState("Fabric & design adjustment");
  const [changePriceDollars, setChangePriceDollars] = useState("15.00");
  const [changePriceSubmitting, setChangePriceSubmitting] = useState(false);
  const [changePriceError, setChangePriceError] = useState<string | null>(null);

  async function safeFetch(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
    if (!res.ok) {
      throw new Error(
        (data.error as string) ??
          (data.message as string) ??
          `Server ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return data;
  }

  async function post(path: string) {
    return safeFetch(`/api/orders/${orderId}/${path}`, { method: "POST" });
  }

  async function postJson(path: string, body: unknown) {
    return safeFetch(`/api/orders/${orderId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleBuildChecklist() {
    setBuildingChecklist(true);
    setChecklistError(null);
    try {
      await post("checklist");
      window.location.reload();
    } catch (e) {
      setChecklistError(e instanceof Error ? e.message : "Error");
    } finally {
      setBuildingChecklist(false);
    }
  }

  function updateLine(i: number, field: keyof Omit<PriceLine, "id">, value: string | number) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  async function handlePriceSubmit() {
    setPriceSubmitting(true);
    setPriceError(null);
    try {
      await postJson("price-lines", { lines });
      window.location.reload();
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : "Error");
    } finally {
      setPriceSubmitting(false);
    }
  }

  async function handlePropose() {
    setProposing(true);
    setProposeError(null);
    try {
      await post("propose");
      window.location.reload();
    } catch (e) {
      setProposeError(e instanceof Error ? e.message : "Error");
    } finally {
      setProposing(false);
    }
  }

  async function handleNoteSubmit() {
    if (!noteText.trim()) return;
    setNoteSubmitting(true);
    setNoteError(null);
    setNoteSuccess(false);
    try {
      await postJson("progress-notes", { text: noteText.trim() });
      setNoteText("");
      setNoteSuccess(true);
      setTimeout(() => setNoteSuccess(false), 4000);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error");
    } finally {
      setNoteSubmitting(false);
    }
  }

  function handlePhotoSelect(file: File | null) {
    setPhotoFile(file);
    if (!file) {
      setPhotoPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handlePhotoUpload() {
    if (!photoFile) return;
    if (photoFile.size > 5 * 1024 * 1024) {
      setPhotoError("File must be under 5 MB");
      return;
    }
    setPhotoSubmitting(true);
    setPhotoError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(photoFile);
      });
      const res = await postJson("photos", { photos: [base64] });
      if (res?.rejected === "UNRELATED") {
        setPhotoError("Photo verification rejected: the uploaded image does not appear to show the ordered garment. Please upload a clear photo of the finished outfit.");
        return;
      }
      if (res?.needsManualReview) {
        setPhotoError(`Photo uploaded. AI flagged for manual review: ${String(res.reason || "Review pending")}`);
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      setPhotoFile(null);
      setPhotoPreview(null);
      window.location.reload();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Error");
    } finally {
      setPhotoSubmitting(false);
    }
  }

  async function handleRecheck() {
    setRecheckSubmitting(true);
    setRecheckError(null);
    try {
      await postJson("photos", { recheck: true });
      window.location.reload();
    } catch (e) {
      setRecheckError(e instanceof Error ? e.message : "Error");
    } finally {
      setRecheckSubmitting(false);
    }
  }

  async function handleAction(action: "start" | "ship") {
    setActionSubmitting(true);
    setActionError(null);
    try {
      await post(action);
      window.location.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error");
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handlePriceChangeRequest(changeId: string) {
    const amountCents = Math.round(parseFloat(changePriceDollars || "0") * 100);
    if (amountCents <= 0) {
      setChangePriceError("Amount must be greater than $0");
      return;
    }
    setChangePriceSubmitting(true);
    setChangePriceError(null);
    try {
      await postJson(`changes/${changeId}/price`, {
        lines: [{ label: changePriceLabel.trim(), amountCents }],
      });
      setChangePricingId(null);
      window.location.reload();
    } catch (err) {
      setChangePriceError(err instanceof Error ? err.message : "Failed to price change request");
    } finally {
      setChangePriceSubmitting(false);
    }
  }

  const verdictLabel: Record<string, string> = {
    MET: "Covered",
    PARTLY_MET: "Needs Fix",
    NOT_MET: "Not Met",
    UNCHECKED: "Pending Check",
  };
  const verdictColor: Record<string, string> = {
    MET: "text-emerald-700 bg-emerald-50 border border-emerald-200",
    PARTLY_MET: "text-amber-700 bg-amber-50 border border-amber-200",
    NOT_MET: "text-rose-700 bg-rose-50 border border-rose-200",
    UNCHECKED: "text-slate-500 bg-slate-50 border border-slate-200",
  };

  const showProgress = state === "AUTHORIZED" || state === "IN_PROGRESS";
  const showRecheck = state === "SUBMITTED" && needsManualReview;
  const showPhotoUpload =
    state === "IN_PROGRESS" ||
    state === "CHECK_FAILED" ||
    (state === "SUBMITTED" && !needsManualReview);
  const showStart = state === "AUTHORIZED";
  const showShip = state === "CHECK_PASSED";
  const showPriceEditor = state === "DRAFT";
  const showPropose = state === "DRAFT";
  const showCheckResults = verifyItems.length > 0;
  const pendingChanges = changeRequests.filter((cr) => cr.status === "PENDING_PRICE");

  return (
    <div className="space-y-6">
      {/* Workshop Branding Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center">
            <Scissors size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sri Karthika Tailors Workshop Studio</h3>
            <p className="text-xs text-slate-500">Merchant Order Management &amp; Craftsmanship Verification</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
          Stage: {state.replace(/_/g, " ")}
        </span>
      </div>

      {/* Pending Change Requests from Customer */}
      {pendingChanges.length > 0 && (
        <section className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-600" />
              <h2 className="font-bold text-sm text-amber-950">Customer Requested a Scope Change</h2>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              Needs Tailor Pricing
            </span>
          </div>
          <p className="text-xs text-slate-600">
            The customer has submitted an updated alteration request. Please specify your add-on pricing to proceed.
          </p>

          {pendingChanges.map((cr) => (
            <div key={cr.id} className="p-4 rounded-xl border border-amber-100 bg-amber-50/50 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">Change Request ID:</span>
                <span className="font-mono text-slate-500">#{cr.id.slice(-6)}</span>
              </div>

              {changePricingId === cr.id ? (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Add-on Item Description</label>
                      <input
                        type="text"
                        value={changePriceLabel}
                        onChange={(e) => setChangePriceLabel(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Add-on Price (USD $)</label>
                      <input
                        type="number"
                        step="0.50"
                        min="0"
                        value={changePriceDollars}
                        onChange={(e) => setChangePriceDollars(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                      />
                    </div>
                  </div>
                  {changePriceError && <p className="text-xs text-rose-600">{changePriceError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handlePriceChangeRequest(cr.id)}
                      disabled={changePriceSubmitting}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {changePriceSubmitting ? "Submitting…" : "Send Price to Customer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChangePricingId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setChangePricingId(cr.id)}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm"
                >
                  Price This Change
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Build checklist */}
      {state === "DRAFT" && !hasChecklist && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-sm mb-2 text-slate-800">Checklist</h2>
          {buildingChecklist ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              Analyzing commission specifications &amp; references…
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">
                No checklist yet. Generate structured requirements from the customer description.
              </p>
              <button
                type="button"
                onClick={handleBuildChecklist}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
              >
                Generate Specification Checklist
              </button>
            </>
          )}
          {checklistError && <p className="text-rose-600 text-xs mt-2">{checklistError}</p>}
        </section>
      )}

      {/* Price-line editor */}
      {showPriceEditor && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Set Order Price Lines</h2>
              <p className="text-xs text-slate-500">Specify your tailoring and delivery charges in USD.</p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Sri Karthika Standard Rates
            </span>
          </div>

          <div className="space-y-2.5">
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2 items-center flex-wrap">
                <select
                  value={line.kind}
                  onChange={(e) => updateLine(i, "kind", e.target.value as PriceLineKind)}
                  className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-slate-50 font-medium text-slate-700"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Service description"
                  value={line.label}
                  onChange={(e) => updateLine(i, "label", e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs flex-1 min-w-[180px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">$</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={line.amountCents ? (line.amountCents / 100).toFixed(2) : ""}
                    onChange={(e) =>
                      updateLine(i, "amountCents", Math.round(parseFloat(e.target.value || "0") * 100))
                    }
                    className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs w-full pl-6 font-semibold"
                    min={0}
                  />
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-rose-500 text-xs px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() =>
                setLines((prev) => [...prev, { kind: "BASE", label: "Custom Embroidery Detailing", amountCents: 2000 }])
              }
              className="text-xs font-semibold text-indigo-700 hover:underline"
            >
              + Add Price Line
            </button>
            <button
              type="button"
              onClick={handlePriceSubmit}
              disabled={priceSubmitting}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl disabled:opacity-50 hover:bg-slate-800 shadow-sm transition-all"
            >
              {priceSubmitting ? "Saving…" : "Save Price Lines"}
            </button>
          </div>
          {priceError && <p className="text-rose-600 text-xs mt-2">{priceError}</p>}
        </section>
      )}

      {/* Propose */}
      {showPropose && (
        <section className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Send size={16} className="text-emerald-700" />
              <span>Propose Order to Customer</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              Ready for Submission
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Sends the itemized checklist and agreed pricing to Priya Sundaram for customer acceptance.
          </p>
          <button
            type="button"
            onClick={handlePropose}
            disabled={proposing}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 shadow-sm transition-all flex items-center justify-center gap-1.5"
          >
            {proposing ? "Proposing…" : "Submit Formal Proposal"}
          </button>
          {proposeError && <p className="text-rose-600 text-xs mt-2">{proposeError}</p>}
        </section>
      )}

      {/* Start work */}
      {showStart && (
        <section className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>Payment Held by PayPal — Ready to Start</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              Funds Authorized
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Customer funds are held in PayPal escrow. You may safely cut the fabric and begin garment construction.
          </p>
          <button
            type="button"
            onClick={() => handleAction("start")}
            disabled={actionSubmitting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5"
          >
            {actionSubmitting ? "Starting…" : "Begin Garment Construction"}
          </button>
          {actionError && <p className="text-rose-600 text-xs mt-2">{actionError}</p>}
        </section>
      )}

      {/* Progress note */}
      {showProgress && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-slate-500" />
            <span>Post Tailoring Progress Update</span>
          </h2>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value.slice(0, 500))}
            placeholder="Inform customer of your stage (e.g. Fabric cut completed, assembling bodice and attaching gold border)…"
            rows={2}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{noteText.length}/500</span>
            <div className="flex items-center gap-2">
              {noteSuccess && <span className="text-xs text-emerald-700 font-semibold">✓ Note posted to timeline</span>}
              <button
                type="button"
                onClick={handleNoteSubmit}
                disabled={noteSubmitting || !noteText.trim()}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-40 transition-colors shadow-sm"
              >
                {noteSubmitting ? "Posting…" : "Post Progress Note"}
              </button>
            </div>
          </div>
          {noteError && <p className="text-rose-600 text-xs mt-1">{noteError}</p>}
        </section>
      )}

      {/* Photo uploader */}
      {showPhotoUpload && (
        <section className="bg-white border-2 border-emerald-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Upload size={16} className="text-emerald-700" />
                <span>Upload Finished Work Photo (Mandatory)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated visual inspection verifies your photo against each checklist specification before shipping is permitted.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              Round {checkRound + 1} of 2
            </span>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 flex flex-col items-center justify-center gap-2 text-center">
            {photoPreview ? (
              <div className="relative max-h-48 overflow-hidden rounded-xl border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Finished work preview" className="object-cover max-h-48 rounded-xl" />
                <button
                  type="button"
                  onClick={() => handlePhotoSelect(null)}
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/80 text-white text-xs"
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <Upload size={28} className="text-slate-400" />
                <p className="text-xs font-medium text-slate-700">Select finished outfit photo</p>
                <p className="text-[11px] text-slate-400">JPEG, PNG, WebP up to 5 MB</p>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-500 mt-2"
            />
          </div>

          <button
            type="button"
            onClick={handlePhotoUpload}
            disabled={photoSubmitting || !photoFile}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 shadow-sm transition-all flex items-center justify-center gap-2"
          >
            {photoSubmitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Verifying Garment Specifications…</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Upload &amp; Submit for Verification</span>
              </>
            )}
          </button>
          {photoError && <p className="text-rose-600 text-xs mt-2">{photoError}</p>}
        </section>
      )}

      {/* Retry photo check */}
      {showRecheck && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-sm text-slate-900">Re-run Verification Check</h2>
          <p className="text-xs text-slate-500">Verification check experienced a connection timeout. Re-run with the submitted photos.</p>
          <button
            type="button"
            onClick={handleRecheck}
            disabled={recheckSubmitting}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={recheckSubmitting ? "animate-spin" : ""} />
            <span>{recheckSubmitting ? "Checking…" : "Re-run Verification"}</span>
          </button>
          {recheckError && <p className="text-rose-600 text-xs mt-2">{recheckError}</p>}
        </section>
      )}

      {/* Check Results */}
      {showCheckResults && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-700" />
              <span>Specification Inspection Audit</span>
            </h2>
            <span className="text-xs text-slate-400">Round {checkRound} of 2</span>
          </div>
          <ul className="space-y-2">
            {checklistItems.map((item) => {
              const v = verifyItems.find((vi) => vi.itemId === item.id);
              const verdict = v?.verdict ?? "UNCHECKED";
              const isFit = item.checkMethod === "fit";
              return (
                <li key={item.id} className="flex gap-3 items-start p-2.5 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold mt-0.5 ${verdictColor[verdict]}`}>
                    {isFit ? "Fit Check (Customer Confirms)" : verdictLabel[verdict]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800">{item.label_en}</p>
                    {v?.fixNote && <p className="text-[11px] text-amber-700 mt-0.5 font-medium">{v.fixNote}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Mark shipped */}
      {showShip && (
        <section className="bg-white border-2 border-emerald-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-700" />
              <span>Photo Verification Passed! Ready to Ship</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              Check Passed
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Confirm that the finished outfit has been dispatched to Priya Sundaram.
          </p>
          <button
            type="button"
            onClick={() => handleAction("ship")}
            disabled={actionSubmitting}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 shadow-sm transition-all"
          >
            {actionSubmitting ? "Marking Dispatched…" : "Confirm Order Dispatched / Shipped"}
          </button>
          {actionError && <p className="text-rose-600 text-xs mt-2">{actionError}</p>}
        </section>
      )}
    </div>
  );
}
