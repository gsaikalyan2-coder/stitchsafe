import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Resend from "next-auth/providers/resend"
import { prisma } from "@/server/db"
import { PayPalProvider } from "./paypalProvider"
import type { UserRole } from "@/generated/prisma/client"

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM ?? "noreply@stitchsafe.dev",
    }),
    PayPalProvider({
      clientId: process.env.PAYPAL_LOGIN_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_LOGIN_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        const [dbUser, paypalAccount] = await Promise.all([
          prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true, phoneVerified: true, roleChosen: true },
          }),
          prisma.account.findFirst({
            where: { userId: user.id, provider: "paypal" },
            select: { provider: true },
          }),
        ])
        session.user.role = (dbUser?.role ?? "CUSTOMER") as UserRole
        session.user.phoneVerified = dbUser?.phoneVerified ?? false
        session.user.paypalVerified = paypalAccount !== null
        session.user.roleChosen = dbUser?.roleChosen ?? false
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
})
