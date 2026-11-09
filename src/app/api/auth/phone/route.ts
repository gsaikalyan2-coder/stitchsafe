export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/server/auth/auth"
import { verifyFirebaseToken } from "@/server/auth/phone"
import { prisma } from "@/server/db"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json() as { idToken?: string }
  if (!body.idToken) {
    return NextResponse.json({ error: "idToken required" }, { status: 400 })
  }

  let phoneNumber: string
  try {
    const result = await verifyFirebaseToken(body.idToken)
    phoneNumber = result.phoneNumber
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { phoneNumber, phoneVerified: true },
  })

  return NextResponse.json({ ok: true, phoneNumber })
}
