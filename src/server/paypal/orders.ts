// src/server/paypal/orders.ts
// PayPal Orders v2: create (AUTHORIZE intent), get, and authorize.

import { paypalFetch } from "./client";
import type { PayPalAmount } from "@/domain/pricing";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

interface CreateOrderResponse {
  id: string;
  links: PayPalLink[];
}

interface AuthorizeOrderResponse {
  purchase_units: Array<{
    payments?: {
      authorizations?: Array<{
        id: string;
        status: string;
        expiration_time?: string;
      }>;
    };
  }>;
}

export interface AuthorizeOrderResult {
  authorizationId: string;
  status: string;
  expirationTime: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function approveLink(links: PayPalLink[]): string {
  const link = links.find((l) => l.rel === "payer-action");
  if (!link) throw new Error("PayPal create order response missing payer-action link");
  return link.href;
}

// ── API calls ──────────────────────────────────────────────────────────────────

/**
 * Create a PayPal order with AUTHORIZE intent.
 *
 * Request-Id: create-<paymentId>  (idempotent for 6 h)
 * Returns the PayPal order ID and the approve URL to send to the customer.
 */
export async function createAuthorizeOrder(params: {
  amount: PayPalAmount;
  orderId: string;
  paymentId: string;
  mockHeader?: string;
}): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const authUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const returnUrl = `${authUrl}/orders/${params.orderId}?paypal=return`;
  const cancelUrl = `${authUrl}/orders/${params.orderId}?paypal=cancel`;

  const res = await paypalFetch<CreateOrderResponse>("POST", "/v2/checkout/orders", {
    requestId: `create-${params.paymentId}`,
    mockHeader: params.mockHeader,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: params.orderId,
          reference_id: params.paymentId,
          amount: params.amount,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  });

  return {
    paypalOrderId: res.id,
    approveUrl: approveLink(res.links),
  };
}

/** Get a PayPal order by ID. */
export async function getOrder(paypalOrderId: string): Promise<unknown> {
  return paypalFetch("GET", `/v2/checkout/orders/${paypalOrderId}`);
}

/**
 * Authorize a PayPal order after customer approval.
 *
 * Request-Id: authorize-<paymentId>  (idempotent for 6 h)
 */
export async function authorizeOrder(
  paypalOrderId: string,
  paymentId: string,
  mockHeader?: string,
): Promise<AuthorizeOrderResult> {
  const res = await paypalFetch<AuthorizeOrderResponse>(
    "POST",
    `/v2/checkout/orders/${paypalOrderId}/authorize`,
    {
      requestId: `authorize-${paymentId}`,
      mockHeader,
      body: {},
    },
  );

  const authorization = res.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!authorization?.id) {
    throw new Error("PayPal authorize response missing authorization ID");
  }

  return {
    authorizationId: authorization.id,
    status: authorization.status,
    expirationTime: authorization.expiration_time ?? null,
  };
}
