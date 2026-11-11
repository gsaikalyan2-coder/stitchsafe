export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role = body.role === "TAILOR" ? "TAILOR" : "CUSTOMER";

    const tailorEmail = process.env.SEED_TAILOR_EMAIL ?? "tailor@demo.test";
    const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? "customer@demo.test";
    const targetEmail = role === "TAILOR" ? tailorEmail : customerEmail;
    const targetName = role === "TAILOR" ? "Sri Karthika Tailors" : "Priya Sundaram";

    const user = await prisma.user.upsert({
      where: { email: targetEmail },
      update: {
        role,
        name: targetName,
        roleChosen: true,
        phoneVerified: true,
      },
      create: {
        email: targetEmail,
        name: targetName,
        role,
        roleChosen: true,
        phoneVerified: true,
      },
    });

    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const destination = role === "TAILOR" ? "/tailor" : "/customer";
    const res = NextResponse.json({ ok: true, role, redirectTo: destination });

    // Set standard NextAuth / Auth.js v5 database session cookie
    const isProd = process.env.NODE_ENV === "production";
    const cookieName = isProd ? "__Secure-authjs.session-token" : "authjs.session-token";
    res.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
      secure: isProd,
    });

    // Also set fallback cookie name in case of legacy next-auth client checks
    if (!isProd) {
      res.cookies.set("next-auth.session-token", sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires,
        secure: false,
      });
    }

    return res;
  } catch (err) {
    return NextResponse.json(
      { error: "LOGIN_FAILED", message: err instanceof Error ? err.message : "Failed to sign in" },
      { status: 500 },
    );
  }
}

