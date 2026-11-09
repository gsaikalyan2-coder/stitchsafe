// tests/server/paypal/client.test.ts
// Tests: token cache (fetches once, reuses until 5m before expiry),
//        PayPal-Request-Id on every POST, error mapping.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  paypalFetch,
  PayPalError,
  _clearTokenCacheForTests,
} from "../../../src/server/paypal/client";

// ── fetch mock ─────────────────────────────────────────────────────────────────

function makeTokenResponse(expiresIn = 3600) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: "mock-token", expires_in: expiresIn }),
  };
}

function makeApiResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeApiError(status: number, name: string, debugId: string, details: unknown[] = []) {
  return {
    ok: false,
    status,
    json: async () => ({ name, debug_id: debugId, details }),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _clearTokenCacheForTests();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  _clearTokenCacheForTests();
});

// ── Token cache ────────────────────────────────────────────────────────────────

describe("token cache", () => {
  it("fetches a token on first call and reuses it on second call", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse()) // token fetch
      .mockResolvedValueOnce(makeApiResponse({ id: "order-1" })) // first API call
      .mockResolvedValueOnce(makeApiResponse({ id: "order-2" })); // second API call

    await paypalFetch("GET", "/v2/checkout/orders/order-1");
    await paypalFetch("GET", "/v2/checkout/orders/order-2");

    // Token endpoint called exactly once
    const tokenCalls = fetchMock.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes("/v1/oauth2/token"),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("re-fetches a token when it is within 5 minutes of expiry", async () => {
    // expires_in = 299 → expiresAt = now + (299-300)*1000 = already expired
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse(299)) // first token (nearly expired)
      .mockResolvedValueOnce(makeApiResponse({ id: "order-1" }))
      .mockResolvedValueOnce(makeTokenResponse(3600)) // second token
      .mockResolvedValueOnce(makeApiResponse({ id: "order-2" }));

    await paypalFetch("GET", "/v2/checkout/orders/order-1");
    await paypalFetch("GET", "/v2/checkout/orders/order-2");

    const tokenCalls = fetchMock.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes("/v1/oauth2/token"),
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it("throws when PAYPAL_CLIENT_ID is missing", async () => {
    delete process.env.PAYPAL_CLIENT_ID;
    await expect(paypalFetch("GET", "/v2/checkout/orders/x")).rejects.toThrow(
      /PAYPAL_CLIENT_ID/,
    );
  });
});

// ── PayPal-Request-Id ──────────────────────────────────────────────────────────

describe("POST sends PayPal-Request-Id", () => {
  it("includes the requestId header on every POST", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeApiResponse({ id: "cap-1", status: "COMPLETED" }));

    await paypalFetch("POST", "/v2/payments/authorizations/auth-1/capture", {
      requestId: "capture-auth-1",
      body: { final_capture: true },
    });

    const apiCall = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("/authorizations/"),
    );
    expect(apiCall).toBeDefined();
    const headers = (apiCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers["PayPal-Request-Id"]).toBe("capture-auth-1");
  });

  it("includes Prefer: return=representation on every POST", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeApiResponse({ id: "cap-1", status: "COMPLETED" }));

    await paypalFetch("POST", "/v2/payments/authorizations/auth-1/capture", {
      requestId: "capture-auth-1",
      body: { final_capture: true },
    });

    const apiCall = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("/authorizations/"),
    );
    const headers = (apiCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers["Prefer"]).toBe("return=representation");
  });

  it("throws when POST is called without requestId", async () => {
    fetchMock.mockResolvedValueOnce(makeTokenResponse());
    await expect(
      paypalFetch("POST", "/v2/payments/authorizations/auth-1/capture", { body: {} }),
    ).rejects.toThrow(/requestId/);
  });
});

// ── Error mapping ──────────────────────────────────────────────────────────────

describe("PayPalError mapping", () => {
  it("maps a PayPal API error to PayPalError with correct fields", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(
        makeApiError(422, "UNPROCESSABLE_ENTITY", "debug-abc", [
          { issue: "AUTHORIZATION_ALREADY_CAPTURED" },
        ]),
      );

    let caught: PayPalError | null = null;
    try {
      await paypalFetch("POST", "/v2/payments/authorizations/auth-1/capture", {
        requestId: "capture-auth-1",
        body: {},
      });
    } catch (err) {
      caught = err as PayPalError;
    }

    expect(caught).toBeInstanceOf(PayPalError);
    expect(caught!.status).toBe(422);
    expect(caught!.paypalName).toBe("UNPROCESSABLE_ENTITY");
    expect(caught!.debugId).toBe("debug-abc");
    expect(caught!.details[0]).toEqual({ issue: "AUTHORIZATION_ALREADY_CAPTURED" });
    // Message must not include secrets
    expect(caught!.message).not.toContain("test-client-id");
    expect(caught!.message).not.toContain("test-client-secret");
  });

  it("sets default fields when PayPal error body is not parseable JSON", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("not json"); },
      });

    let caught: PayPalError | null = null;
    try {
      await paypalFetch("GET", "/v2/payments/authorizations/auth-1");
    } catch (err) {
      caught = err as PayPalError;
    }

    expect(caught).toBeInstanceOf(PayPalError);
    expect(caught!.status).toBe(500);
    expect(caught!.paypalName).toBe("UNKNOWN_ERROR");
  });

  it("forwards the mock header when provided", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeApiResponse({ id: "order-1" }));

    await paypalFetch("POST", "/v2/checkout/orders/order-1/authorize", {
      requestId: "authorize-pay-1",
      body: {},
      mockHeader: "INTERNAL_SERVER_ERROR",
    });

    const apiCall = fetchMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("/authorize"),
    );
    const headers = (apiCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers["PayPal-Mock-Response"]).toBe("INTERNAL_SERVER_ERROR");
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });

    const result = await paypalFetch("POST", "/v2/payments/authorizations/auth-1/void", {
      requestId: "void-auth-1",
      body: {},
    });

    expect(result).toBeUndefined();
  });
});
