export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { reportProblem } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ text: z.string().min(1) });

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
    await reportProblem(orderId, userId, parsed.data.text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
