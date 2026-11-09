import type { UserRole } from "@/generated/prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: UserRole
      phoneVerified: boolean
      paypalVerified: boolean
      roleChosen: boolean
    }
  }
}
