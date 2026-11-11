// src/app/api/_errors.ts
// Shared error-to-response mapper for all API routes.

import { NextResponse } from "next/server";
import {
  ForbiddenError,
  InvalidTransitionError,
  GateBlockedError,
  NotFoundError,
} from "@/server/services/orderService";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "FORBIDDEN", message: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "NOT_FOUND", message: err.message }, { status: 404 });
  }
  if (err instanceof InvalidTransitionError) {
    return NextResponse.json({ error: "INVALID_TRANSITION", message: err.message }, { status: 409 });
  }
  if (err instanceof GateBlockedError) {
    return NextResponse.json(
      { error: "GATE_BLOCKED", message: err.message, reasons: err.reasons },
      { status: 422 },
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("PayPal")) {
    return NextResponse.json({ error: "PAYPAL_ERROR", message }, { status: 502 });
  }
  if (message.includes("NEEDS_MANUAL_REVIEW") || message.includes("AI")) {
    return NextResponse.json({ error: "AI_UNAVAILABLE", message }, { status: 503 });
  }
  if (err instanceof Error && err.name === "ZodError") {
    return NextResponse.json({ error: "VALIDATION", message: err.message }, { status: 400 });
  }

  return NextResponse.json({ error: "INTERNAL", message }, { status: 500 });
}

/** Standard auth check — returns userId or a 401 response. */
export function requireAuth(session: { user?: { id?: string } } | null): string | NextResponse {
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED", message: "Not signed in" }, { status: 401 });
  }
  return session.user.id;
}
