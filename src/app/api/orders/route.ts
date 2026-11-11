export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { createOrder, buildChecklistForOrder } from "@/server/services/orderService";

import { prisma } from "@/server/db";

// P9: customer creates order with tailor email + description + optional reference photos (base64)
const Body = z.object({
  tailorEmail: z.string().email(),
  description: z.string().min(1),
  referencePhotos: z.array(z.string()).max(5).optional(), // base64 JPEG strings
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  const tailor = await prisma.user.findUnique({ where: { email: parsed.data.tailorEmail } });
  if (!tailor) {
    return NextResponse.json({ error: "NOT_FOUND", message: "No tailor account found for that email" }, { status: 404 });
  }

  if (tailor.id === userId) {
    return NextResponse.json({ error: "VALIDATION", message: "Cannot create an order with yourself" }, { status: 400 });
  }

  const photoBuffers = parsed.data.referencePhotos?.map((b64) => Buffer.from(b64, "base64"));

  try {
    const result = await createOrder(userId, tailor.id, parsed.data.description, photoBuffers);
    // Best-effort checklist build; if AI fails, customer can retry via "Regenerate with AI"
    let needsManualReview = false;
    try {
      const cl = await buildChecklistForOrder(result.orderId, userId);
      if ("needsManualReview" in cl) needsManualReview = true;
    } catch {
      needsManualReview = true;
    }
    return NextResponse.json({ order: { ...result, needsManualReview } });
  } catch (err) {
    return errorResponse(err);
  }
}
