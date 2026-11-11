export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { errorResponse, requireAuth } from "@/app/api/_errors";
import { customerSummary } from "@/server/services/dashboardService";

export async function GET(_req: NextRequest) {
  const session = await auth();
  const userId = requireAuth(session);
  if (userId instanceof NextResponse) return userId;

  try {
    const result = await customerSummary(userId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
