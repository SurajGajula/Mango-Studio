import type { Metadata } from 'next'
import './globals.css'
import { Inter, Playfair_Display, Antonio } from 'next/font/google'
import { AuthProvider } from '@/app/components/AuthProvider'
import { Analytics } from "@vercel/analytics/next"

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const antonio = Antonio({ subsets: ['latin'], weight: '300', variable: '--font-antonio' })

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
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${antonio.variable}`}>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
