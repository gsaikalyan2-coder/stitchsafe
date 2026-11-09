// src/server/paypal/authorizations.ts
// PayPal Payments v2: capture, void, reauthorize, get authorization.

import { paypalFetch } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CaptureResult {
  captureId: string;
  status: string;
}

export interface ReauthorizeResult {
  authorizationId: string;
  status: string;
  expirationTime: string | null;
}

export interface AuthorizationStatus {
  id: string;
  status: string;
  expirationTime: string | null;
}

// ── API calls ──────────────────────────────────────────────────────────────────

/**
 * Capture a PayPal authorization (final).
 *
 * Request-Id: capture-<authorizationId>  (idempotent for 6 h)
 * PayPal returns the same capture ID on retry — safe to call twice.
 */
export async function captureAuthorization(
  authorizationId: string,
  mockHeader?: string,
): Promise<CaptureResult> {
  const res = await paypalFetch<{ id: string; status: string }>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    {
      requestId: `capture-${authorizationId}`,
      mockHeader,
      body: { final_capture: true },
    },
  );

  return { captureId: res.id, status: res.status };
}

/**
 * Void a PayPal authorization.
 *
 * Request-Id: void-<authorizationId>  (idempotent for 6 h)
 */
export async function voidAuthorization(
  authorizationId: string,
  mockHeader?: string,
): Promise<void> {
  await paypalFetch<void>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/void`,
    {
      requestId: `void-${authorizationId}`,
      mockHeader,
      body: {},
    },
  );
}

/**
 * Reauthorize a PayPal authorization (extend the hold).
 *
 * Request-Id: reauth-<authorizationId>  (idempotent for 6 h)
 * Returns the new authorization ID and expiration time.
 */
export async function reauthorizeAuthorization(
  authorizationId: string,
  mockHeader?: string,
): Promise<ReauthorizeResult> {
  const res = await paypalFetch<{
    id: string;
    status: string;
    expiration_time?: string;
  }>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/reauthorize`,
    {
      requestId: `reauth-${authorizationId}`,
      mockHeader,
      body: {},
    },
  );

  return {
    authorizationId: res.id,
    status: res.status,
    expirationTime: res.expiration_time ?? null,
  };
}

/** Get the current state of a PayPal authorization. */
export async function getAuthorization(authorizationId: string): Promise<AuthorizationStatus> {
  const res = await paypalFetch<{
    id: string;
    status: string;
    expiration_time?: string;
  }>("GET", `/v2/payments/authorizations/${authorizationId}`);

  return {
    id: res.id,
    status: res.status,
    expirationTime: res.expiration_time ?? null,
  };
}
