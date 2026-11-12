import type { Metadata } from "next"
import { Providers } from "./providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "StitchSafe — PayPal Escrow for Bespoke Fashion",
  description: "Cross-border bespoke fashion commerce secured by PayPal escrow.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-gray-900 antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
