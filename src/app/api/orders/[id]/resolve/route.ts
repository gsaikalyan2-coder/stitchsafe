export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { resolveFailedChecks } from "@/server/services/orderService";

const BodySchema = z.object({
  decision: z.enum(["ACCEPT_ANYWAY", "CANCEL"]).optional(),
  resolution: z.enum(["ACCEPT_ANYWAY", "CANCEL"]).optional(),
}).refine((data) => data.decision || data.resolution, {
  message: "Either decision or resolution must be provided",
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
  const decision = (parsed.data.decision ?? parsed.data.resolution)!;

  try {
    await resolveFailedChecks(orderId, userId, decision);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
