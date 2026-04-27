import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Boop Agent', template: '%s | Boop Agent' },
  description:
    'A proactive iMessage-based personal agent built on the Claude Agent SDK. Multi-agent architecture, robust memory, automations, and 1000+ integrations via Composio.',
  keywords: ['iMessage agent', 'Claude Agent SDK', 'AI agent', 'Composio', 'Convex', 'Sendblue', 'boop'],
  authors: [{ name: 'Chris Raroque', url: 'https://github.com/raroque' }],
  openGraph: {
    type: 'website',
    url: 'https://boop-agent.vercel.app',
    title: 'Boop Agent — Your new best friend 🐶',
    description:
      'A proactive iMessage-based personal agent built on the Claude Agent SDK.',
    images: [{ url: '/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boop Agent',
    description:
      'A proactive iMessage-based personal agent built on the Claude Agent SDK.',
    images: ['/og'],
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans bg-bg-base text-text-primary">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
