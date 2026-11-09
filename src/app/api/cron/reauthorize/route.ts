// src/app/api/cron/reauthorize/route.ts
// Called by GitHub Actions cron. Runs reauthorizeDue + autoCaptureDue.
// Bearer token is checked with crypto.timingSafeEqual (length-first to avoid throws).

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { reauthorizeDue, autoCaptureDue } from "@/server/services/orderService";

function checkBearer(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return false;
  const token = auth.slice(prefix.length);

  // Compare lengths first — timingSafeEqual throws on different buffer sizes
  if (token.length !== secret.length) return false;

  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const reauthorized = await reauthorizeDue(now);
  const autoCaptured = await autoCaptureDue(now);

  return NextResponse.json({ reauthorized, autoCaptured, ranAt: now.toISOString() });
}
