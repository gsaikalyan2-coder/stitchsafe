// tests/server/cron.test.ts
// Tests the cron route's bearer check: correct / wrong / missing / different-length → 200/401.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock orderService before importing the route so the route never touches DB/PayPal
vi.mock("@/server/services/orderService", () => ({
  reauthorizeDue: vi.fn().mockResolvedValue(0),
  autoCaptureDue: vi.fn().mockResolvedValue(0),
}));

// Dynamic import AFTER vi.mock is hoisted
const { POST } = await import("../../src/app/api/cron/reauthorize/route");

const SECRET = "super-secret-cron-key-32-chars!";

function makeReq(authHeader?: string) {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost:3000/api/cron/reauthorize", {
    method: "POST",
    headers,
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("cron bearer check", () => {
  it("returns 200 with correct token", async () => {
    const res = await POST(makeReq(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json() as { reauthorized: number; autoCaptured: number };
    expect(typeof body.reauthorized).toBe("number");
    expect(typeof body.autoCaptured).toBe("number");
  });

  it("returns 401 with wrong token (same length)", async () => {
    const wrong = SECRET.slice(0, -1) + "X"; // same length, different last char
    const res = await POST(makeReq(`Bearer ${wrong}`));
    expect(res.status).toBe(401);
  });

  it("returns 401 with different-length token", async () => {
    const res = await POST(makeReq("Bearer short"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with missing Authorization header", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeReq(`Bearer ${SECRET}`));
    expect(res.status).toBe(401);
  });

  it("returns 401 when header lacks Bearer prefix", async () => {
    const res = await POST(makeReq(SECRET)); // no "Bearer " prefix
    expect(res.status).toBe(401);
  });
});
