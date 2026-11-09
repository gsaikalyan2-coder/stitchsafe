export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/server/auth/auth"
import { prisma } from "@/server/db"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const Body = z.object({
  role: z.enum(["TAILOR", "CUSTOMER"]),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: parsed.data.role, roleChosen: true },
  })

  revalidatePath("/dashboard")
  return NextResponse.json({ ok: true })
}
