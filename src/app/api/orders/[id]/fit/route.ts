export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { confirmFit } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  itemId: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const { id: orderId } = await ctx.params;
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  try {
    await confirmFit(orderId, userId, parsed.data.itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

