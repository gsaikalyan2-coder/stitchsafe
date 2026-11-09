import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StitchSafe',
  description: 'Agree it, hold it, check it, release it.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
