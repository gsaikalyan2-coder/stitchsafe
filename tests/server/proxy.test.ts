// tests/server/proxy.test.ts
// Verifies that API routes bypass the proxy auth redirect.
// proxy() must return undefined (no redirect) for /api/** paths.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/auth/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

function makeReq(pathname: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, { method: "GET" });
}

describe("proxy — API routes bypass auth redirect", () => {
  it("returns undefined for /api/cron/reauthorize", async () => {
    expect(await proxy(makeReq("/api/cron/reauthorize"))).toBeUndefined();
  });

  it("returns undefined for /api/orders/abc/payment", async () => {
    expect(await proxy(makeReq("/api/orders/abc/payment"))).toBeUndefined();
  });

  it("returns undefined for /api/health", async () => {
    expect(await proxy(makeReq("/api/health"))).toBeUndefined();
  });

  it("returns undefined for /api/auth/session", async () => {
    expect(await proxy(makeReq("/api/auth/session"))).toBeUndefined();
  });

  it("redirects unauthenticated page routes to /login", async () => {
    const result = await proxy(makeReq("/dashboard"));
    expect(result?.status).toBe(307);
    expect(result?.headers.get("location")).toContain("/login");
  });
});
