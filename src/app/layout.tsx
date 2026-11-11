import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Providers } from "./providers"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "StitchSafe",
  description: "Agree it, hold it, check it, release it.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-surface text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
