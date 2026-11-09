// src/server/paypal/client.ts
// PayPal REST API client: OAuth2 token cache + typed fetch wrapper.
// All PayPal calls go through paypalFetch(); nothing else calls the PayPal API directly.

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

// ── Token cache ────────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Date.now() ms
}

let tokenCache: TokenCache | null = null;

async function fetchToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not configured");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    // Do not log credentials or response body (may contain sensitive data)
    throw new Error(`PayPal token request failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh 300 s before actual expiry to avoid using a near-expired token
  const expiresAt = Date.now() + (data.expires_in - 300) * 1000;
  tokenCache = { accessToken: data.access_token, expiresAt };
  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  return fetchToken();
}

// ── Error type ─────────────────────────────────────────────────────────────────

export interface PayPalErrorDetail {
  issue?: string;
  description?: string;
  field?: string;
  value?: string;
}

export class PayPalError extends Error {
  readonly status: number;
  readonly paypalName: string;
  readonly debugId: string;
  readonly details: PayPalErrorDetail[];

  constructor(status: number, paypalName: string, debugId: string, details: PayPalErrorDetail[]) {
    // Do not include raw response body — it may contain sensitive data
    super(`PayPal error ${status} ${paypalName} (debug_id: ${debugId})`);
    this.name = "PayPalError";
    this.paypalName = paypalName;
    this.status = status;
    this.debugId = debugId;
    this.details = details;
    Object.setPrototypeOf(this, PayPalError.prototype);
  }
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

/**
 * Make an authenticated PayPal API call.
 *
 * - POST requests always include:
 *     PayPal-Request-Id: <requestId>  (passed by caller; deterministic per action)
 *     Prefer: return=representation
 * - mockHeader: value for PayPal-Mock-Response (sandbox negative testing only)
 * - Throws PayPalError on non-2xx.
 */
export async function paypalFetch<T = unknown>(
  method: "GET" | "POST",
  path: string,
  options?: {
    requestId?: string;
    body?: unknown;
    mockHeader?: string;
  },
): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (method === "POST") {
    if (!options?.requestId) {
      throw new Error("PayPal POST requires a requestId (PayPal-Request-Id)");
    }
    headers["PayPal-Request-Id"] = options.requestId;
    headers["Prefer"] = "return=representation";
  }

  if (options?.mockHeader) {
    headers["PayPal-Mock-Response"] = options.mockHeader;
  }

  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method,
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let paypalName = "UNKNOWN_ERROR";
    let debugId = "";
    let details: PayPalErrorDetail[] = [];
    try {
      const err = (await res.json()) as {
        name?: string;
        debug_id?: string;
        details?: PayPalErrorDetail[];
      };
      paypalName = err.name ?? paypalName;
      debugId = err.debug_id ?? "";
      details = err.details ?? [];
    } catch {
      // JSON parse failed; use defaults — do not propagate raw body
    }
    throw new PayPalError(res.status, paypalName, debugId, details);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/** Exposed for tests: clear the token cache between test cases. */
export function _clearTokenCacheForTests(): void {
  tokenCache = null;
}
