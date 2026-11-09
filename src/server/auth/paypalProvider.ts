import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers"

export interface PayPalProfile {
  payer_id?: string
  user_id?: string
  email?: string
  emails?: { value: string; primary?: boolean }[]
  name: string
  verified_account?: boolean
}

export function PayPalProvider(
  options: OAuthUserConfig<PayPalProfile>
): OAuthConfig<PayPalProfile> {
  const base = process.env.PAYPAL_WEB_BASE ?? "https://www.sandbox.paypal.com"
  const api = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com"

  return {
    id: "paypal",
    name: "PayPal",
    type: "oauth",
    checks: ["state"],
    // Seeded demo users exist before their first PayPal login; link the PayPal account to the
    // user with the same (PayPal-verified) email instead of failing with OAuthAccountNotLinked.
    allowDangerousEmailAccountLinking: true,
    authorization: {
      url: `${base}/connect`,
      params: {
        flowEntry: "static",
        scope: "openid email profile https://uri.paypal.com/services/paypalattributes",
        response_type: "code",
      },
    },
    token: `${api}/v1/oauth2/token`,
    // PayPal's documented userinfo endpoint is /v1/identity/oauth2/userinfo (the old
    // /openidconnect/ path returns an empty body). Custom request so failures show
    // PayPal's real status and body instead of "Unexpected end of JSON input".
    userinfo: {
      url: `${api}/v1/identity/oauth2/userinfo?schema=paypalv1.1`,
      async request({ tokens }: { tokens: { access_token?: string } }) {
        if (!tokens.access_token) throw new Error("PayPal token response had no access_token")
        const res = await fetch(`${api}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        })
        const text = await res.text()
        if (!res.ok || !text) {
          throw new Error(`PayPal userinfo failed: HTTP ${res.status} ${text.slice(0, 300) || "(empty body)"}`)
        }
        return JSON.parse(text) as PayPalProfile
      },
    },
    profile(profile) {
      const id = profile.payer_id ?? profile.user_id
      if (!id) throw new Error("PayPal profile missing payer_id and user_id")

      const primaryEntry = profile.emails?.find((e) => e.primary)
      const email = primaryEntry?.value ?? profile.emails?.[0]?.value ?? profile.email
      if (!email) throw new Error("PayPal profile missing email")

      return { id, name: profile.name, email, image: null }
    },
    ...options,
  } as OAuthConfig<PayPalProfile>
}
