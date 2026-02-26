import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mango Studio',
  description: 'Mango Studio Application',
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
