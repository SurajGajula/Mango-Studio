import { Antonio, Inter, Playfair_Display } from 'next/font/google'

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const antonio = Antonio({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  display: 'swap',
  variable: '--font-antonio',
})

export const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
})

export const previewFontClassNames = [inter.variable, antonio.variable, playfair.variable].join(' ')
