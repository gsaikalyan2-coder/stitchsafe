import { auth } from "@/server/auth/auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  redirect(session.user.role === "TAILOR" ? "/tailor" : "/customer")
}
