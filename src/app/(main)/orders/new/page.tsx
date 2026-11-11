"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ImagePlus, Send, X, Sparkles, Scissors } from "lucide-react"
import Link from "next/link"

const MAX_PHOTOS = 5
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ["image/jpeg", "image/png", "image/webp"]

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const SAMPLE_PROMPTS = [
  {
    title: "Silk Anarkali Suit",
    desc: "Navy blue silk Anarkali suit with gold zari embroidery on round neckline, full churidar sleeves, 48 inches floor length, cotton lining, and matching dupatta with border piping. Need in 14 days.",
  },
  {
    title: "Designer Saree Blouse",
    desc: "Emerald green raw silk saree blouse with sweetheart neck, elbow-length sleeves, padded cups, back dori with latkan tassels, and golden lace border. Bust size 36, waist 30. Delivery in 10 days.",
  },
  {
    title: "Festive Kurta & Trouser Set",
    desc: "Maroon Chanderi silk straight kurta with mandarin collar, side slits, matching cigarette trousers with elasticated waistband, and side pockets. Need completed in 2 weeks.",
  },
]

export default function NewOrderPage() {
  const router = useRouter()
  const defaultTailorEmail = "gsaikalyan2@gmail.com"
  const [tailorEmail, setTailorEmail] = useState(defaultTailorEmail)
  const [description, setDescription] = useState("")
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function addPhotos(list: FileList | null) {
    if (!list) return
    setError("")
    const next = [...photos]
    for (const f of Array.from(list)) {
      if (!ALLOWED.includes(f.type)) { setError(`${f.name}: only JPG, PNG or WEBP`); continue }
      if (f.size > MAX_BYTES) { setError(`${f.name}: larger than 5 MB`); continue }
      if (next.length >= MAX_PHOTOS) { setError(`Up to ${MAX_PHOTOS} photos`); break }
      next.push(f)
    }
    setPhotos(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const referencePhotos = await Promise.all(photos.map(toBase64))
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tailorEmail: tailorEmail.trim(),
          description: description.trim(),
          ...(referencePhotos.length ? { referencePhotos } : {}),
        }),
      })
      const text = await res.text()
      let data: { order?: { orderId: string }; message?: string }
      try { data = JSON.parse(text) } catch { setError(`Server ${res.status}: ${text.slice(0, 200)}`); return }
      if (!res.ok || !data.order) { setError(data.message ?? "Failed to create order"); return }
      router.push(`/orders/${data.order.orderId}`)
    } catch (err) {
      setError(`Client error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <Link
        href="/customer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Customer Orders
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create Bespoke Order</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Describe the outfit you want tailored. Our AI will automatically extract an itemized checklist of measurements and design points for your review.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm">
        {/* Tailor Selection */}
        <div>
          <label htmlFor="tailorEmail" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
            Selected Tailor Studio
          </label>
          <div className="relative">
            <input
              id="tailorEmail"
              type="email"
              required
              value={tailorEmail}
              onChange={(e) => setTailorEmail(e.target.value)}
              placeholder="tailor@example.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-800"
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <Scissors size={12} /> Sri Karthika Tailors (Official Boutique)
            </span>
            {tailorEmail !== defaultTailorEmail && (
              <button
                type="button"
                onClick={() => setTailorEmail(defaultTailorEmail)}
                className="text-slate-400 hover:underline"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>

        {/* Outfit Description */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="description" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Garment Design &amp; Specifications
            </label>
            <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
              <Sparkles size={12} /> AI Extraction Enabled
            </span>
          </div>

          <textarea
            id="description"
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the dress, fabric, color, neckline, sleeves, measurements (chest, waist, length), and target completion date…"
            className="w-full rounded-2xl border border-slate-200 p-4 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 leading-relaxed"
          />

          {/* Quick Sample Prompts */}
          <div className="mt-2.5 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Quick Test Inpirations:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setDescription(p.desc)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                >
                  ⚡ {p.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Reference Photos (Optional) */}
        <div>
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
            Reference Photos <span className="font-normal text-slate-400">(Optional, up to {MAX_PHOTOS})</span>
          </span>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {photos.map((p, i) => (
              <div key={`${p.name}-${i}`} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(p)} alt={p.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-slate-900/80 p-1 text-white shadow hover:bg-rose-600 transition-colors"
                  aria-label="Remove photo"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-all bg-slate-50/50">
                <ImagePlus size={20} />
                <span className="text-[11px] font-medium">Add Photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = "" }}
                />
              </label>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Attach design sketches, sample necklines, or embroidery inspiration photos.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-40"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>AI is Extracting Tailoring Specifications…</span>
            </span>
          ) : (
            <>
              <Send size={16} />
              <span>Generate Order &amp; Checklist</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
