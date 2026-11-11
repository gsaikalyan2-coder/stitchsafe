"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus, Trash2, Edit2, Send, Check, X } from "lucide-react";
import type { ChecklistItem } from "@/server/ai/schemas";

interface ChecklistEditorProps {
  orderId: string;
  initialItems: ChecklistItem[];
  isCustomer: boolean;
  orderState: string;
  customerAccepted: boolean;
  versionId?: string;
}

export function ChecklistEditor({
  orderId,
  initialItems,
  isCustomer,
  orderState,
  customerAccepted,
  versionId,
}: ChecklistEditorProps) {
  const router = useRouter();
  const [items, setItems] = useState<ChecklistItem[]>(initialItems);
  const [isEditing, setIsEditing] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [newItemMethod, setNewItemMethod] = useState<"photo" | "fit">("photo");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isDraftOrProposed = orderState === "DRAFT" || orderState === "PROPOSED";
  const canCustomerEdit = isCustomer && isDraftOrProposed;

  function toggleMethod(id: string) {
    if (!isEditing) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, checkMethod: item.checkMethod === "photo" ? "fit" : "photo" }
          : item,
      ),
    );
  }

  function removeItem(id: string) {
    if (!isEditing) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function addItem() {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: "item_" + Date.now().toString(36),
      label_en: newItemText.trim(),
      label_local: newItemText.trim(),
      local_lang: "en",
      source_quote: "Customer added specification",
      checkMethod: newItemMethod,
    };
    setItems((prev) => [...prev, newItem]);
    setNewItemText("");
  }

  function startEditItem(item: ChecklistItem) {
    setEditingId(item.id);
    setEditingText(item.label_en);
  }

  function saveEditItem(id: string) {
    if (!editingText.trim()) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label_en: editingText.trim() } : item)),
    );
    setEditingId(null);
  }

  async function handleSaveChecklist(sendToTailorAfter = false) {
    if (items.length === 0) {
      setError("Checklist must contain at least one specification item.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // 1. Save edits
      const res = await fetch(`/api/orders/${orderId}/edit-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Failed to save checklist");
      }

      // 2. If DRAFT and customer requests to send to tailor
      if (sendToTailorAfter && orderState === "DRAFT") {
        const sendRes = await fetch(`/api/orders/${orderId}/send-to-tailor`, { method: "POST" });
        if (!sendRes.ok) {
          const body = (await sendRes.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? "Failed to notify tailor");
        }
        setSuccessMsg("Checklist saved and sent to tailor for proposal!");
      } else {
        setSuccessMsg("Checklist updated successfully.");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving checklist");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateAI() {
    setRegenerating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/checklist`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "AI checklist extraction failed");
      }
      setSuccessMsg("AI generated a fresh checklist based on your specifications!");
      router.refresh();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating checklist");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAcceptChecklist() {
    if (!versionId) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Failed to accept checklist");
      }
      router.refresh();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error accepting checklist");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare size={18} className="text-emerald-700" />
            <span>Specifications Checklist</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bilateral agreement. Specifications verified against finished garment photos prior to dispatch.
          </p>
        </div>

        {canCustomerEdit && (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Edit2 size={13} />
                  <span>Customize Checklist</span>
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateAI}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 transition-colors disabled:opacity-50"
                >
                  <CheckSquare size={13} />
                  <span>{regenerating ? "Extracting…" : "Auto-Extract Specifications"}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setItems(initialItems);
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveChecklist(false)}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-700">✓</span>
            <span className="font-medium">{successMsg}</span>
          </div>
          {isCustomer && orderState === "DRAFT" && (
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/demo-login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ role: "TAILOR" }),
                });
                window.location.reload();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-all shadow-xs"
            >
              Switch to Tailor Studio to Price Order →
            </button>
          )}
        </div>
      )}

      {/* Checklist items list */}
      <ul className="space-y-2.5">
        {items.map((item, index) => {
          const isItemEditing = editingId === item.id;
          return (
            <li
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                isEditing
                  ? "bg-slate-50/70 border-slate-200"
                  : "bg-white border-slate-100 hover:border-slate-200"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {index + 1}
              </span>

              <div className="flex-1 min-w-0">
                {isItemEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => saveEditItem(item.id)}
                      className="p-1 rounded-md bg-emerald-600 text-white"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded-md bg-slate-200 text-slate-600"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800 leading-snug">
                      {item.label_en}
                    </span>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditItem(item)}
                        className="text-xs text-slate-400 hover:text-slate-700"
                      >
                        <Edit2 size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Check Method Badge */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleMethod(item.id)}
                  disabled={!isEditing}
                  title={isEditing ? "Click to switch between photo check and fit check" : undefined}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                    item.checkMethod === "photo"
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  } ${isEditing ? "cursor-pointer hover:opacity-80 active:scale-95" : "cursor-default"}`}
                >
                  {item.checkMethod === "photo" ? "📷 Photo Check" : "📏 Fit Check"}
                </button>

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                    title="Remove specification"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Add new specification input (when editing) */}
      {isEditing && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add custom specification (e.g. Neck depth 7 inches, side zip)…"
            className="flex-1 min-w-[240px] rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select
            value={newItemMethod}
            onChange={(e) => setNewItemMethod(e.target.value as "photo" | "fit")}
            className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs bg-white text-slate-700"
          >
            <option value="photo">Photo check</option>
            <option value="fit">Fit check</option>
          </select>
          <button
            type="button"
            onClick={addItem}
            disabled={!newItemText.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <Plus size={13} />
            <span>Add Item</span>
          </button>
        </div>
      )}

      {/* Customer Action Bar: In DRAFT -> "Send to Tailor"; In PROPOSED -> "Accept Proposal" */}
      {isCustomer && (
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {orderState === "DRAFT" && (
            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-3">
              <span className="text-xs text-slate-500">
                Ready with your specifications?
              </span>
              <button
                type="button"
                onClick={() => handleSaveChecklist(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
              >
                <Send size={13} />
                <span>{saving ? "Sending…" : "Send to Sri Karthika Tailors"}</span>
              </button>
            </div>
          )}

          {orderState === "PROPOSED" && (
            <div className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-xs text-blue-900 font-medium">
                Tailor proposed pricing and specifications. Ready to proceed?
              </span>
              {!customerAccepted ? (
                <button
                  type="button"
                  onClick={handleAcceptChecklist}
                  disabled={accepting}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {accepting ? "Accepting…" : "Accept Checklist & Proposal"}
                </button>
              ) : (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Check size={14} /> Accepted
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

