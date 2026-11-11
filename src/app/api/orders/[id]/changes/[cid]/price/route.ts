export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { priceChange } from "@/server/services/orderService";

const BodySchema = z.object({
  lines: z.array(
    z.object({
      label: z.string(),
      amountCents: z.number().int().min(0),
    }),
  ),
});

type Ctx = { params: Promise<{ id: string; cid: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  const { id: orderId, cid } = await ctx.params;

  try {
    await priceChange(orderId, cid, userId, parsed.data.lines);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
