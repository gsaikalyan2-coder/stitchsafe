export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { prisma } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/services/orderService";

type Ctx = { params: Promise<{ id: string }> };

const PostBody = z.object({ content: z.string().min(1).max(2000) });

async function loadOrderForUser(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError(`Order ${orderId} not found`);
  if (userId !== order.customerId && userId !== order.tailorId) {
    throw new ForbiddenError("User is not a party on this order");
  }
  return order;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const { id: orderId } = await ctx.params;

  try {
    await loadOrderForUser(orderId, userId);
    const messages = await prisma.message.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ messages });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", message: parsed.error.message }, { status: 400 });
  }

  const { id: orderId } = await ctx.params;

  try {
    await loadOrderForUser(orderId, userId);
    const message = await prisma.message.create({
      data: {
        orderId,
        senderId: userId,
        role: "USER",
        content: parsed.data.content,
      },
    });
    return NextResponse.json({ message });
  } catch (err) {
    return errorResponse(err);
  }
}
