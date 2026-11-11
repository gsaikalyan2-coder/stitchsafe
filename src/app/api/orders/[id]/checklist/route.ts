export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { buildChecklistForOrder } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const { id: orderId } = await ctx.params;

  try {
    const result = await buildChecklistForOrder(orderId, userId);
    return NextResponse.json({ order: result });
  } catch (err) {
    return errorResponse(err);
  }
}
