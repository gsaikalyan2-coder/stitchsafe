export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { addProgressNote } from "@/server/services/orderService";

const BodySchema = z.object({
  text: z.string().min(1).max(500).optional(),
  note: z.string().min(1).max(500).optional(),
}).refine((data) => data.text || data.note, {
  message: "Either text or note must be provided",
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  const { id: orderId } = await ctx.params;
  const noteText = (parsed.data.text ?? parsed.data.note)!;

  try {
    await addProgressNote(orderId, userId, noteText);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
