import type { Metadata } from 'next'
import './globals.css'
import { previewFontClassNames } from '@/app/lib/previewFonts'
import { AuthProvider } from '@/app/components/AuthProvider'
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: 'Mango Studio',
  description: 'Mango Studio',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={previewFontClassNames}>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
