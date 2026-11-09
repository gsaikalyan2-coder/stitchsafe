// src/app/api/orders/[id]/payment/route.ts
// Creates a PayPal AUTHORIZE order for the given order ID.

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { createPayPalOrder } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await ctx.params;

  try {
    const result = await createPayPalOrder(orderId, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create PayPal order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
