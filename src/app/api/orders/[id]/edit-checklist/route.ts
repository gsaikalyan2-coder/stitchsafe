export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { editChecklist } from "@/server/services/orderService";
import { ChecklistItemSchema } from "@/server/ai/schemas";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  items: z.array(ChecklistItemSchema).min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const { id: orderId } = await ctx.params;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await editChecklist(orderId, userId, parsed.data.items);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
