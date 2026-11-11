export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { submitPhotos, recheckPhotos } from "@/server/services/orderService";

const BodySchema = z.union([
  z.object({ photos: z.array(z.string().min(1)).min(1) }),
  z.object({ recheck: z.literal(true) }),
]);

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

  try {
    if ("recheck" in parsed.data) {
      const result = await recheckPhotos(orderId, userId);
      return NextResponse.json(result);
    }
    const photoBuffers = parsed.data.photos.map(b64 => Buffer.from(b64, "base64"));
    const result = await submitPhotos(orderId, userId, photoBuffers);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
