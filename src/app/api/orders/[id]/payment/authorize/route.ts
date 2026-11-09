// src/app/api/orders/[id]/payment/authorize/route.ts
// Authorizes the PayPal order after the customer approves it.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { authorizePayment } from "@/server/services/orderService";

const BodySchema = z.object({ paypalOrderId: z.string().min(1) });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing paypalOrderId" }, { status: 400 });
  }

  const { id: orderId } = await ctx.params;

  try {
    await authorizePayment(orderId, parsed.data.paypalOrderId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to authorize payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
