# StitchSafe — API Documentation

All API endpoints are hosted under Next.js App Router (`src/app/api/...`). Requests and responses use standard JSON encoding unless handling multipart file uploads.

## 1. Authentication Endpoints
- `GET /api/auth/[...nextauth]` — Auth.js session handling, Google/PayPal OAuth callbacks.
- `POST /api/auth/demo-login` — Dual quick-access portal login for Tailor ("Sri Karthika Tailors") and Customer ("Priya Sundaram"). Sets authenticated session cookies.

## 2. Order Creation & Management
- `POST /api/orders`
  - **Body:** `{ tailorEmail: string, description: string, referencePhotos?: string[] }`
  - **Action:** Generates order draft, triggers Gemini AI to create initial checklist from description/photos.
- `GET /api/orders/[id]` — Returns full order data, checklist versions, price lines, photos, and event trail.
- `POST /api/orders/[id]/checklist`
  - **Body:** `{ items: ChecklistItem[] }`
  - **Action:** Customer or tailor updates the checklist (adds, edits, removes items, toggles PHOTO/FIT method).
- `POST /api/orders/[id]/price-lines`
  - **Body:** `{ lines: Array<{ kind: string, label: string, amountCents: number }> }`
  - **Action:** Tailor sets quotation lines (Base, Rush, Shipping, Customs). Transitions order from `DRAFT` to `PROPOSED`.
- `POST /api/orders/[id]/agree`
  - **Action:** Customer accepts the tailor's proposal and checklist. Transitions order to `AGREED`.

## 3. PayPal Escrow Integration
- `POST /api/orders/[id]/paypal/create`
  - **Action:** Initiates PayPal order with `intent: "AUTHORIZE"`. Returns `{ paypalOrderId, approveUrl }`.
- `POST /api/orders/[id]/paypal/authorize`
  - **Body:** `{ paypalOrderId: string }`
  - **Action:** Captures authorization hold on customer's PayPal. Transitions order to `AUTHORIZED`.

## 4. Tailor Workshop & Photo Verification
- `POST /api/orders/[id]/progress-notes`
  - **Body:** `{ text: string }`
  - **Action:** Tailor logs workshop updates, transitions order to `IN_PROGRESS`.
- `POST /api/orders/[id]/photos`
  - **Body:** `{ photos: string[] }` (Base64 JPEG/PNG) or `{ recheck: true }`
  - **Action:** Tailor submits mandatory photos. Gemini Vision inspects photos against each checklist requirement. Transitions order to `CHECK_PASSED`, `CHECK_FAILED`, or returns `UNRELATED` / `NEEDS_MANUAL_REVIEW`.
- `GET /api/photos?path=...`
  - **Action:** Securely streams stored garment reference and finished inspection photos.
- `POST /api/orders/[id]/ship`
  - **Action:** Tailor marks order as shipped. Transitions order to `SHIPPED`.

## 5. Scope Alterations & Change Requests
- `POST /api/orders/[id]/request-changes`
  - **Body:** `{ description: string }`
  - **Action:** Customer requests alteration. AI analyzes differences against checklist.
- `POST /api/orders/[id]/changes/[cid]/price`
  - **Body:** `{ lines: Array<{ label: string, amountCents: number }> }`
  - **Action:** Tailor prices the customer's alteration request.
- `POST /api/orders/[id]/changes/[cid]/accept`
  - **Action:** Customer accepts change; diff merges into checklist and updates order total.
- `POST /api/orders/[id]/changes/[cid]/reject`
  - **Action:** Customer declines alteration quotation; request marked `REJECTED`.

## 5. Fit Confirmation, Release & Resolution
- `POST /api/orders/[id]/fit`
  - **Body:** `{ itemId: string }`
  - **Action:** Customer marks an individual fit item as confirmed. When all fit items are confirmed, triggers `captureAllLive` to release escrowed funds to tailor (`RELEASED`).
- `POST /api/orders/[id]/resolve`
  - **Body:** `{ decision: "ACCEPT_ANYWAY" | "CANCEL" }`
  - **Action:** Allows customer to accept garment or cancel order if check failed across 2 rounds.
- `POST /api/orders/[id]/cancel`
  - **Action:** Cancels order and voids active PayPal authorizations.

## 6. Real-Time Order Messaging (Order Chat)
- `GET /api/orders/[id]/messages`
  - **Action:** Returns order chat thread with timestamps and roles.
- `POST /api/orders/[id]/messages`
  - **Body:** `{ content: string }`
  - **Action:** Appends new message to the order thread.

