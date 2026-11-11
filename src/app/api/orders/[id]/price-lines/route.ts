export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { setPriceLines } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  lines: z.array(
    z.object({
      kind: z.string(),
      label: z.string(),
      amountCents: z.number().int().min(0),
    }),
  ),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  const { id: orderId } = await ctx.params;

  try {
    const result = await setPriceLines(orderId, userId, parsed.data.lines);
    return NextResponse.json({ order: result });
  } catch (err) {
    return errorResponse(err);
  }
}
