# StitchSafe — Database Documentation & Schema

## 1. Database Overview
- **Engine:** PostgreSQL (hosted on Supabase)
- **ORM:** Prisma Client
- **Schema File:** `prisma/schema.prisma`

## 2. Entity Relationship Overview

```
 ┌───────────┐         1:N         ┌───────────────┐
 │   User    │────────────────────<│     Order     │
 └───────────┘                     └───────┬───────┘
                                           │ 1:N
           ┌───────────────────────────────┼───────────────────────────────┐
           │                               │                               │
           ▼ 1:N                           ▼ 1:N                           ▼ 1:N
   ┌───────────────┐               ┌───────────────┐               ┌───────────────┐
   │    Payment    │               │  OrderEvent   │               │ ChecklistVer  │
   └───────────────┘               └───────────────┘               └───────────────┘
           │                               │                               │
           ▼ 1:N                           ▼ 1:N                           ▼ 1:N
   ┌───────────────┐               ┌───────────────┐               ┌───────────────┐
   │   PriceLine   │               │     Photo     │               │ ChangeRequest │
   └───────────────┘               └───────────────┘               └───────────────┘
```

## 3. Core Models & Field Definitions

### `User`
- `id` (String, cuid): Primary key.
- `name` (String?): Display name (e.g. "Sri Karthika Tailors", "Priya Sundaram").
- `email` (String, unique): User email.
- `role` (UserRole: `TAILOR`, `CUSTOMER`, `ADMIN`): System authorization role.
- `phoneVerified` (Boolean): Phone verification badge.
- `paypalVerified` (Boolean): PayPal merchant/buyer verification status.

### `Order`
- `id` (String, cuid): Primary key.
- `customerId` (String): Foreign key referencing `User`.
- `tailorId` (String): Foreign key referencing `User`.
- `state` (OrderState): `DRAFT`, `PROPOSED`, `AGREED`, `AUTHORIZED`, `IN_PROGRESS`, `SUBMITTED`, `CHECK_PASSED`, `CHECK_FAILED`, `SHIPPED`, `RELEASED`, `CANCELLED`, `VOIDED`, `DISPUTED`.
- `totalCents` (Int): Total agreed price in cents.
- `checkRound` (Int): Number of AI verification photo rounds submitted (max 2).
- `needsManualReview` (Boolean): Triggered if AI flags uncertainty or ambiguous photos.
- `dueDate` (DateTime?): Promised completion date.
- `shippedAt` (DateTime?): Timestamp when tailor marked as dispatched.
- `fitConfirmedAt` (DateTime?): Timestamp when customer released funds.

### `Payment`
- `id` (String, cuid): Primary key.
- `orderId` (String): Foreign key referencing `Order`.
- `type` (PaymentType): `BASE`, `ADDON`.
- `amountCents` (Int): Held or captured amount in cents.
- `status` (PaymentStatus): `PENDING`, `AUTHORIZED`, `CAPTURED`, `VOIDED`.
- `paypalOrderId` (String?): PayPal transaction ID.
- `paypalAuthorizationId` (String?): PayPal authorization hold ID.
- `paypalCaptureId` (String?): Final capture ID upon release.
- `authorizedAt` (DateTime?): Authorization timestamp.
- `honorUntil` (DateTime?): 3-day PayPal guaranteed window.
- `expiresAt` (DateTime?): 29-day hard authorization cutoff.

### `ChecklistVersion`
- `id` (String, cuid): Primary key.
- `orderId` (String): Foreign key referencing `Order`.
- `version` (Int): Monotonically increasing version (1, 2, 3...).
- `items` (Json): JSON array of `ChecklistItem` objects:
  - `id`: Unique identifier (e.g., `item_1`).
  - `label_en`: Specific verification requirement.
  - `checkMethod`: `PHOTO` (AI inspects) or `FIT` (customer confirms on body).
  - `category`: `MEASUREMENT`, `FINISH`, `STYLING`, `FABRIC`.

### `OrderEvent`
- `id` (String, cuid): Primary key.
- `orderId` (String): Foreign key referencing `Order`.
- `fromState` (OrderState?): Previous state.
- `toState` (OrderState): New state.
- `actorId` (String): ID of user, or `"SYSTEM"`.
- `type` (String): Action event type (`STATE_CHANGE`, `PAYPAL_CAPTURED`, `PHOTOS_SUBMITTED`, etc.).
- `payload` (Json?): Structured metadata (no raw image bytes).
- `createdAt` (DateTime): Immutable timestamp.

