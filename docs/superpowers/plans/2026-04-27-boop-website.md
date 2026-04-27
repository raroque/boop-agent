# Boop Agent Marketing Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 2-page Next.js 14 marketing + documentation website in `website/` subdirectory of the boop-agent repo.

**Architecture:** Landing page (`/`) with Hero, Architecture diagram, Features grid, Quickstart steps, and Prerequisites table. Docs page (`/docs`) with a fixed sidebar and all 5 markdown files fetched from GitHub raw URLs at build time rendered as a single scrollable page. All pages are SSG/ISR — no client-side data fetching. Client components are isolated to interactive widgets (Navbar hamburger, copy buttons, sidebar active tracking).

**Tech Stack:** Next.js 14 App Router, TypeScript 5, Tailwind CSS v3, unified + remark-gfm + rehype-pretty-code (Shiki) for markdown, lucide-react for icons, next/font for Inter + JetBrains Mono.

---

## File Map

```
website/
  package.json                          ← Next.js project deps (separate from root)
  next.config.ts                        ← image domains, no extra config needed
  tailwind.config.ts                    ← custom color theme
  postcss.config.js                     ← autoprefixer
  tsconfig.json                         ← strict TS, path aliases
  app/
    layout.tsx                          ← root layout, fonts, full Metadata export
    globals.css                         ← CSS vars, scrollbar, base styles
    page.tsx                            ← landing page (server component)
    sitemap.ts                          ← / and /docs routes
    robots.ts                           ← allow all
    docs/
      page.tsx                          ← docs page (async server component)
    og/
      route.tsx                         ← OG image via ImageResponse (@vercel/og)
  components/
    Navbar.tsx                          ← "use client" — hamburger state
    Footer.tsx                          ← static server component
    Hero.tsx                            ← static server component
    FeaturesGrid.tsx                    ← static server component
    ArchitectureBlock.tsx               ← static server component
    QuickstartBlock.tsx                 ← server component, contains CopyButton
    PrerequisitesTable.tsx              ← static server component
    CopyButton.tsx                      ← "use client" — navigator.clipboard
    DocsLayout.tsx                      ← "use client" — IntersectionObserver sidebar
    DocSection.tsx                      ← server component, dangerouslySetInnerHTML
  lib/
    docs.ts                             ← fetch + parse all 5 MD files, returns HTML
  public/
    assets/
      boop.png                          ← downloaded from GitHub raw
```

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `website/package.json`
- Create: `website/next.config.ts`
- Create: `website/tsconfig.json`
- Create: `website/postcss.config.js`

- [ ] **Step 1: Create `website/package.json`**

```json
{
  "name": "boop-agent-website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "lucide-react": "^0.468.0",
    "remark": "^15.0.1",
    "remark-gfm": "^4.0.0",
    "rehype": "^13.0.1",
    "rehype-pretty-code": "^0.14.0",
    "rehype-stringify": "^10.0.0",
    "remark-rehype": "^11.1.0",
    "shiki": "^1.0.0",
    "unified": "^11.0.5"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/node": "^20.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  }
}
```

- [ ] **Step 2: Create `website/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 3: Create `website/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `website/postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Install dependencies**

```bash
cd website && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add website/package.json website/next.config.ts website/tsconfig.json website/postcss.config.js
git commit -m "feat(website): scaffold Next.js 14 project"
```

---

## Task 2: Tailwind config + global CSS + fonts

**Files:**
- Create: `website/tailwind.config.ts`
- Create: `website/app/globals.css`

- [ ] **Step 1: Create `website/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base:  '#0e0e0e',
          card:  '#161616',
          hover: '#1f1f1f',
        },
        border: '#272727',
        accent: {
          DEFAULT: '#f97316',
          dim:     '#7c3515',
        },
        text: {
          primary:   '#f0f0f0',
          secondary: '#888888',
          muted:     '#555555',
        },
        status: {
          green: '#22c55e',
          red:   '#ef4444',
          blue:  '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Create `website/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-inter: 'Inter', system-ui, sans-serif;
  --font-jetbrains: 'JetBrains Mono', monospace;
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: #0e0e0e;
  color: #f0f0f0;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #0e0e0e; }
::-webkit-scrollbar-thumb { background: #272727; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #333; }

/* Code blocks from rehype-pretty-code */
pre {
  background: #111 !important;
  border: 1px solid #272727;
  border-radius: 0.5rem;
  overflow-x: auto;
  padding: 1rem;
}

code {
  font-family: var(--font-jetbrains), monospace;
  font-size: 0.875em;
}

/* Inline code (not inside pre) */
:not(pre) > code {
  background: #161616;
  border: 1px solid #272727;
  border-radius: 0.25rem;
  padding: 0.125rem 0.375rem;
}

/* Focus rings */
:focus-visible {
  outline: 2px solid #f97316;
  outline-offset: 2px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  html {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add website/tailwind.config.ts website/app/globals.css
git commit -m "feat(website): add Tailwind theme config and global CSS"
```

---

## Task 3: Root layout + metadata + SEO files

**Files:**
- Create: `website/app/layout.tsx`
- Create: `website/app/sitemap.ts`
- Create: `website/app/robots.ts`
- Create: `website/app/og/route.tsx`

- [ ] **Step 1: Create `website/app/layout.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `website/app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://boop-agent.vercel.app',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://boop-agent.vercel.app/docs',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]
}
```

- [ ] **Step 3: Create `website/app/robots.ts`**

```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://boop-agent.vercel.app/sitemap.xml',
  }
}
```

- [ ] **Step 4: Create `website/app/og/route.tsx`**

```tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e0e0e',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 16 }}>🐶</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#f0f0f0',
            marginBottom: 16,
          }}
        >
          Boop Agent
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#888888',
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          A proactive iMessage-based agent built on the Claude Agent SDK
        </div>
        <div
          style={{
            marginTop: 32,
            background: '#f97316',
            color: 'white',
            borderRadius: 8,
            padding: '12px 32px',
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          github.com/raroque/boop-agent
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd website && npm run typecheck
```

Expected: no errors (may need `next-env.d.ts` generated — run `next build` or `next dev` first if missing).

- [ ] **Step 6: Commit**

```bash
git add website/app/layout.tsx website/app/sitemap.ts website/app/robots.ts website/app/og/route.tsx
git commit -m "feat(website): add root layout, metadata, sitemap, robots, OG image route"
```

---

## Task 4: Download boop.png asset

**Files:**
- Create: `website/public/assets/boop.png`

- [ ] **Step 1: Create public/assets directory and download boop.png**

```bash
mkdir -p website/public/assets
curl -L "https://github.com/raroque/boop-agent/raw/main/assets/boop.png" \
  -o website/public/assets/boop.png
```

Expected: `website/public/assets/boop.png` file created (~some KB).

- [ ] **Step 2: Verify file exists and is non-empty**

```bash
ls -lh website/public/assets/boop.png
```

Expected: file size > 0 bytes.

- [ ] **Step 3: Commit**

```bash
git add website/public/assets/boop.png
git commit -m "feat(website): add boop mascot PNG asset"
```

---

## Task 5: CopyButton client component

**Files:**
- Create: `website/components/CopyButton.tsx`

- [ ] **Step 1: Create `website/components/CopyButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  text: string
  className?: string
}

export function CopyButton({ text, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (typeof window === 'undefined') return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <Check size={14} className="text-status-green" />
      ) : (
        <Copy size={14} />
      )}
      <span>{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/CopyButton.tsx
git commit -m "feat(website): add CopyButton client component"
```

---

## Task 6: Navbar component

**Files:**
- Create: `website/components/Navbar.tsx`

- [ ] **Step 1: Create `website/components/Navbar.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Github, Youtube, Menu, X } from 'lucide-react'

export function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-bg-base/80 border-b border-border"
    >
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-accent rounded">
          <Image
            src="/assets/boop.png"
            alt="Boop mascot"
            width={28}
            height={28}
            className="rounded-sm"
            priority
          />
          <span className="font-semibold text-text-primary tracking-tight">Boop</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/docs"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
          >
            Docs
          </Link>
          <a
            href="https://github.com/raroque/boop-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
            aria-label="GitHub repository"
          >
            <Github size={16} />
            <span>GitHub</span>
          </a>
          <a
            href="https://youtu.be/ZpmKjDDbqHs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
            aria-label="YouTube walkthrough"
          >
            <Youtube size={16} />
            <span>YouTube</span>
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent rounded"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-border bg-bg-base">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3">
            <Link
              href="/docs"
              className="text-sm text-text-secondary hover:text-text-primary py-1"
              onClick={() => setOpen(false)}
            >
              Docs
            </Link>
            <a
              href="https://github.com/raroque/boop-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-text-secondary hover:text-text-primary py-1 flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <Github size={15} /> GitHub
            </a>
            <a
              href="https://youtu.be/ZpmKjDDbqHs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-text-secondary hover:text-text-primary py-1 flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <Youtube size={15} /> YouTube
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/Navbar.tsx
git commit -m "feat(website): add responsive Navbar component"
```

---

## Task 7: Footer component

**Files:**
- Create: `website/components/Footer.tsx`

- [ ] **Step 1: Create `website/components/Footer.tsx`**

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { Github, Youtube } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-base">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Logo + name */}
          <div className="flex items-center gap-2">
            <Image
              src="/assets/boop.png"
              alt="Boop mascot"
              width={24}
              height={24}
              className="rounded-sm opacity-80"
            />
            <span className="text-sm font-semibold text-text-secondary">Boop Agent</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center gap-5 text-sm text-text-secondary">
            <a
              href="https://github.com/raroque/boop-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors flex items-center gap-1.5"
            >
              <Github size={14} /> GitHub
            </a>
            <a
              href="https://youtu.be/ZpmKjDDbqHs"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors flex items-center gap-1.5"
            >
              <Youtube size={14} /> YouTube
            </a>
            <Link href="/docs" className="hover:text-text-primary transition-colors">
              Docs
            </Link>
            <a
              href="https://github.com/raroque/boop-agent/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-primary transition-colors"
            >
              MIT License
            </a>
          </div>

          {/* Built on */}
          <p className="text-xs text-text-muted">
            Built on Claude Agent SDK · Powered by Composio · Persisted with Convex
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-xs text-text-muted">
          © {new Date().getFullYear()} Chris Raroque. Open source under the MIT License.
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/Footer.tsx
git commit -m "feat(website): add Footer component"
```

---

## Task 8: Hero section

**Files:**
- Create: `website/components/Hero.tsx`

- [ ] **Step 1: Create `website/components/Hero.tsx`**

```tsx
import Image from 'next/image'
import { Star, Play } from 'lucide-react'

export function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center overflow-hidden"
      aria-label="Hero"
    >
      {/* Animated gradient mesh background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(249,115,22,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 70%, rgba(249,115,22,0.04) 0%, transparent 60%)',
        }}
      />

      {/* Mascot */}
      <div className="mb-6 relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full blur-2xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 70%)' }}
        />
        <Image
          src="/assets/boop.png"
          alt="Boop — your iMessage AI agent mascot"
          width={120}
          height={120}
          priority
          className="relative z-10 rounded-2xl"
          style={{ filter: 'drop-shadow(0 0 24px rgba(249,115,22,0.3))' }}
        />
      </div>

      {/* Headline */}
      <h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-bold text-text-primary mb-4 tracking-tight leading-tight">
        Your new best friend 🐶
      </h1>

      {/* Subtitle */}
      <p className="max-w-2xl text-base sm:text-lg text-text-secondary mb-8 leading-relaxed">
        A proactive iMessage-based agent built on the Claude Agent SDK. Multi-agent
        architecture, robust memory, automations, and 1000+ integrations.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mb-8">
        <a
          href="https://github.com/raroque/boop-agent"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <Star size={16} />
          Star on GitHub
        </a>
        <a
          href="https://youtu.be/ZpmKjDDbqHs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-text-primary font-semibold text-sm hover:bg-bg-hover hover:border-accent/50 transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          <Play size={16} />
          Watch the walkthrough
        </a>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {[
          '43 stars',
          '11 forks',
          'MIT License',
          'Built on Claude Agent SDK',
        ].map((stat) => (
          <span
            key={stat}
            className="px-3 py-1 rounded-full text-xs text-text-muted border border-border bg-bg-card"
          >
            {stat}
          </span>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/Hero.tsx
git commit -m "feat(website): add Hero section with mascot, CTAs, and stat pills"
```

---

## Task 9: ArchitectureBlock component

**Files:**
- Create: `website/components/ArchitectureBlock.tsx`

- [ ] **Step 1: Create `website/components/ArchitectureBlock.tsx`**

```tsx
import { Bot, Cpu, Database, Plug } from 'lucide-react'

const ASCII_DIAGRAM = ` iMessage  →  Sendblue webhook  →  Interaction agent  →  Sub-agents (per task)
                                        │                    │
                                        ▼                    ▼
                                  Memory store  ←──  Integrations (your MCP tools)`

const COMPONENTS = [
  {
    icon: Bot,
    title: 'Interaction Agent',
    description:
      'Lean dispatcher: reads memory, decides what to do, spawns focused sub-agents. Intentionally restricted — no web or file access.',
  },
  {
    icon: Cpu,
    title: 'Execution Agents',
    description:
      'Task-specific sub-agents with full tool access: WebSearch, WebFetch, integrations. One agent per task, spawned on demand.',
  },
  {
    icon: Database,
    title: 'Memory (Convex)',
    description:
      'Tiered short / long / permanent memory with post-turn extraction, decay, and a daily adversarial consolidation pipeline.',
  },
  {
    icon: Plug,
    title: 'Integrations (Composio)',
    description:
      'One API key unlocks 1000+ toolkits — Gmail, Slack, GitHub, Linear, Notion, and more. OAuth handled, no extra setup.',
  },
]

export function ArchitectureBlock() {
  return (
    <section className="py-20 px-4" aria-label="Architecture">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 text-center">
          How it works
        </h2>
        <p className="text-text-secondary text-center mb-10 text-sm">
          A clean separation between receiving messages, deciding what to do, and doing the work.
        </p>

        {/* ASCII diagram */}
        <div className="relative mb-12">
          <pre
            className="font-mono text-xs sm:text-sm text-status-green bg-[#111] border border-border rounded-lg p-4 sm:p-6 overflow-x-auto whitespace-pre leading-relaxed"
            aria-label="Architecture diagram"
          >
            {ASCII_DIAGRAM}
          </pre>
        </div>

        {/* Component cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COMPONENTS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="bg-bg-card border border-border rounded-lg p-4 hover:border-accent/30 hover:bg-bg-hover transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center mb-3">
                <Icon size={16} className="text-accent" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">{title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/ArchitectureBlock.tsx
git commit -m "feat(website): add ArchitectureBlock with ASCII diagram and component cards"
```

---

## Task 10: FeaturesGrid component

**Files:**
- Create: `website/components/FeaturesGrid.tsx`

- [ ] **Step 1: Create `website/components/FeaturesGrid.tsx`**

```tsx
import {
  MessageSquare,
  Terminal,
  GitBranch,
  Shield,
  Layers,
  Search,
  RefreshCw,
  Clock,
  Send,
  Heart,
  Plug,
  LayoutDashboard,
} from 'lucide-react'

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'iMessage in / out',
    description: 'Receive and reply via iMessage with typing indicators and webhook deduplication.',
  },
  {
    icon: Terminal,
    title: 'Sendblue CLI',
    description: 'Auto-registers the inbound webhook on every restart — no manual re-pasting after ngrok URL rotation.',
  },
  {
    icon: GitBranch,
    title: 'Dispatcher + workers',
    description: 'A lean interaction agent spawns focused sub-agents that do the actual work.',
  },
  {
    icon: Shield,
    title: 'Pure dispatcher',
    description: 'Web access, files, and integrations are denied to the interaction agent — sub-agents only.',
  },
  {
    icon: Layers,
    title: 'Tiered memory',
    description: 'Short, long, and permanent tiers with post-turn extraction, decay, and cleaning.',
  },
  {
    icon: Search,
    title: 'Vector search',
    description: 'Semantic recall with Voyage or OpenAI embeddings — falls back to substring without a key.',
  },
  {
    icon: RefreshCw,
    title: 'Memory consolidation',
    description: 'Daily 3-phase adversarial pipeline (proposer → adversary → judge) that merges duplicates and prunes noise.',
  },
  {
    icon: Clock,
    title: 'Automations',
    description: 'Schedule recurring work from a text ("every morning at 8 summarize my calendar") and receive results via iMessage.',
  },
  {
    icon: Send,
    title: 'Draft-and-send',
    description: 'Any external action stages a draft first — the agent only commits when you confirm.',
  },
  {
    icon: Heart,
    title: 'Heartbeat + retry',
    description: 'Stuck agents auto-fail with timeout detection. Retry directly from the debug dashboard.',
  },
  {
    icon: Plug,
    title: 'Composio integrations',
    description: 'One API key unlocks 1000+ toolkits. Gmail, Slack, GitHub, Linear, Notion, and more — OAuth handled.',
  },
  {
    icon: LayoutDashboard,
    title: 'Debug dashboard',
    description: 'React + Vite dashboard with spend, tokens, agent timelines, memory graph, automations, and connections.',
  },
]

export function FeaturesGrid() {
  return (
    <section className="py-20 px-4 bg-bg-card/30" aria-label="Features">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 text-center">
          Everything you need
        </h2>
        <p className="text-text-secondary text-center mb-12 text-sm">
          A full personal agent stack — not just a chatbot.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="bg-bg-card border border-border rounded-lg p-5 hover:border-accent/30 hover:scale-[1.01] transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
                <Icon size={18} className="text-accent" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">{title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/FeaturesGrid.tsx
git commit -m "feat(website): add FeaturesGrid with 12 feature cards"
```

---

## Task 11: QuickstartBlock component

**Files:**
- Create: `website/components/QuickstartBlock.tsx`

- [ ] **Step 1: Create `website/components/QuickstartBlock.tsx`**

```tsx
import { CopyButton } from './CopyButton'
import { ExternalLink } from 'lucide-react'

const STEPS = [
  {
    n: 1,
    title: 'Clone and install',
    cmd: 'git clone https://github.com/raroque/boop-agent.git\ncd boop-agent\nnpm install',
  },
  {
    n: 2,
    title: 'Install Claude Code',
    cmd: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    n: 3,
    title: 'Run setup wizard',
    cmd: 'npm run setup',
  },
  {
    n: 4,
    title: 'Install ngrok',
    cmd: 'npm install -g ngrok\nngrok config add-authtoken <YOUR_TOKEN>',
  },
  {
    n: 5,
    title: 'Start the agent',
    cmd: 'npm run dev',
  },
]

export function QuickstartBlock() {
  return (
    <section className="py-20 px-4" aria-label="Quickstart">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 text-center">
          Get running in 5 steps
        </h2>
        <p className="text-text-secondary text-center mb-12 text-sm">
          The setup wizard handles API keys, webhook registration, and first-run validation.
        </p>

        <ol className="space-y-6">
          {STEPS.map(({ n, title, cmd }) => (
            <li key={n} className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm">
                {n}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary mb-2">{title}</p>
                <div className="relative group">
                  <pre className="font-mono text-xs text-text-secondary bg-[#111] border border-border rounded-lg p-4 overflow-x-auto whitespace-pre">
                    {cmd}
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton text={cmd} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {/* Dashboard callout */}
        <div className="mt-10 p-5 rounded-lg bg-accent/5 border border-accent/20 flex items-start gap-3">
          <ExternalLink size={16} className="text-accent mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-text-primary mb-0.5">Debug dashboard</p>
            <p className="text-xs text-text-secondary">
              Visit{' '}
              <code className="font-mono text-accent">http://localhost:5173</code>{' '}
              after <code className="font-mono text-accent">npm run dev</code> to open the debug dashboard — agents, memory, automations, and connections.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/QuickstartBlock.tsx
git commit -m "feat(website): add QuickstartBlock with numbered steps and copy buttons"
```

---

## Task 12: PrerequisitesTable component

**Files:**
- Create: `website/components/PrerequisitesTable.tsx`

- [ ] **Step 1: Create `website/components/PrerequisitesTable.tsx`**

```tsx
const PREREQS = [
  {
    service: 'Sendblue',
    href: 'https://sendblue.com/?utm_source=raroque',
    why: 'iMessage bridge. Get a number, grab API keys.',
    free: 'Free on their agent plan',
    discount: 'RAROQUE20 — 20% off for 6 months',
  },
  {
    service: 'Convex',
    href: 'https://convex.link/chrisraroque',
    why: 'Database + realtime.',
    free: 'Free tier is plenty',
    discount: '—',
  },
  {
    service: 'Composio',
    href: 'https://composio.dev/?utm_source=chris&utm_medium=youtube&utm_campaign=collab',
    why: 'Integrations — one API key unlocks ~1000 toolkits. Optional for chat + memory only.',
    free: 'Free tier covers personal use',
    discount: 'CHRISXCOMPOSIO — 1 month free on starter plan',
  },
  {
    service: 'ngrok',
    href: 'https://ngrok.com?ref=chrisraroque',
    why: 'Expose your local port so Sendblue can reach it.',
    free: 'Free tier works',
    discount: '—',
  },
]

export function PrerequisitesTable() {
  return (
    <section className="py-20 px-4 bg-bg-card/30" aria-label="Prerequisites">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 text-center">
          What you'll need
        </h2>
        <p className="text-text-secondary text-center mb-10 text-sm">
          All free-tier friendly. The setup wizard will prompt you for each key.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-card">
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Service</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Why</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Free?</th>
                <th className="text-left px-4 py-3 text-text-secondary font-medium">Discount</th>
              </tr>
            </thead>
            <tbody>
              {PREREQS.map(({ service, href, why, free, discount }, i) => (
                <tr
                  key={service}
                  className={`border-b border-border last:border-0 ${
                    i % 2 === 0 ? 'bg-bg-base' : 'bg-bg-card/50'
                  }`}
                >
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
                    >
                      {service}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{why}</td>
                  <td className="px-4 py-3 text-text-secondary">{free}</td>
                  <td className="px-4 py-3 text-text-muted font-mono text-xs">{discount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/PrerequisitesTable.tsx
git commit -m "feat(website): add PrerequisitesTable component"
```

---

## Task 13: Landing page assembly

**Files:**
- Create: `website/app/page.tsx`

- [ ] **Step 1: Create `website/app/page.tsx`**

```tsx
import { Navbar } from '@/components/Navbar'
import { Hero } from '@/components/Hero'
import { ArchitectureBlock } from '@/components/ArchitectureBlock'
import { FeaturesGrid } from '@/components/FeaturesGrid'
import { QuickstartBlock } from '@/components/QuickstartBlock'
import { PrerequisitesTable } from '@/components/PrerequisitesTable'
import { Footer } from '@/components/Footer'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <ArchitectureBlock />
        <FeaturesGrid />
        <QuickstartBlock />
        <PrerequisitesTable />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd website && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add website/app/page.tsx
git commit -m "feat(website): assemble landing page"
```

---

## Task 14: lib/docs.ts — markdown fetch + parse

**Files:**
- Create: `website/lib/docs.ts`

- [ ] **Step 1: Create `website/lib/docs.ts`**

```ts
import { unified } from 'unified'
import remarkParse from 'remark'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeStringify from 'rehype-stringify'

export interface DocFile {
  id: string
  label: string
  html: string
}

const DOC_FILES = [
  { id: 'readme',       label: 'README',       url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/README.md' },
  { id: 'architecture', label: 'Architecture', url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/ARCHITECTURE.md' },
  { id: 'integrations', label: 'Integrations', url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/INTEGRATIONS.md' },
  { id: 'contributing', label: 'Contributing', url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/CONTRIBUTING.md' },
  { id: 'changelog',    label: 'Changelog',    url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/CHANGELOG.md' },
]

async function parseMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypePrettyCode, {
      theme: 'github-dark',
      keepBackground: true,
    })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  return String(file)
}

export async function getAllDocs(): Promise<DocFile[]> {
  const results = await Promise.all(
    DOC_FILES.map(async ({ id, label, url }) => {
      const res = await fetch(url, { next: { revalidate: 3600 } })
      const markdown = res.ok ? await res.text() : `# ${label}\n\n*Could not load this document.*`
      const html = await parseMarkdown(markdown)
      return { id, label, html }
    })
  )
  return results
}
```

**Important:** `remark` (version 15+) exports `remark` as default — import it as `remarkParse` from `'remark'`. The unified pipeline uses `.use(remarkParse)` where `remarkParse` is the `remark` default export (which is a preset containing `remark-parse` + `remark-stringify`). Since we're switching to rehype for output, only the parser portion is used.

**Alternative if the above has type errors** — use `remark-parse` directly:

```ts
import remarkParse from 'remark-parse'
// then: .use(remarkParse)
```

Add `remark-parse` to `website/package.json` dependencies if using this approach:
```bash
cd website && npm install remark-parse
```

- [ ] **Step 2: Commit**

```bash
git add website/lib/docs.ts
git commit -m "feat(website): add docs.ts — fetch and parse markdown from GitHub"
```

---

## Task 15: DocSection component

**Files:**
- Create: `website/components/DocSection.tsx`

- [ ] **Step 1: Create `website/components/DocSection.tsx`**

```tsx
import type { DocFile } from '@/lib/docs'
import { CopyButton } from './CopyButton'

interface DocSectionProps {
  doc: DocFile
}

export function DocSection({ doc }: DocSectionProps) {
  return (
    <article id={doc.id} className="scroll-mt-20 pb-16 border-b border-border last:border-0">
      {/* Section label */}
      <div className="mb-6 flex items-center gap-3">
        <span className="px-2 py-0.5 rounded text-xs font-mono text-text-muted border border-border bg-bg-card">
          {doc.label}.md
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Rendered markdown */}
      <div
        className="prose-custom"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </article>
  )
}
```

- [ ] **Step 2: Add prose-custom CSS to `website/app/globals.css`**

Append the following to the end of `website/app/globals.css`:

```css
/* Docs markdown prose styles */
.prose-custom h1 {
  font-size: 1.875rem;
  font-weight: 700;
  color: #f0f0f0;
  margin-top: 2rem;
  margin-bottom: 1rem;
  line-height: 1.2;
}
.prose-custom h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f0f0f0;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #272727;
}
.prose-custom h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #f0f0f0;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.prose-custom h4 {
  font-size: 1rem;
  font-weight: 600;
  color: #f0f0f0;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}
.prose-custom p {
  color: #888888;
  line-height: 1.75;
  margin-bottom: 1rem;
}
.prose-custom a {
  color: #f97316;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.prose-custom a:hover { color: rgba(249,115,22,0.8); }
.prose-custom ul {
  list-style: disc;
  padding-left: 1.5rem;
  margin-bottom: 1rem;
  color: #888888;
}
.prose-custom ol {
  list-style: decimal;
  padding-left: 1.5rem;
  margin-bottom: 1rem;
  color: #888888;
}
.prose-custom li { margin-bottom: 0.375rem; line-height: 1.7; }
.prose-custom blockquote {
  border-left: 3px solid #f97316;
  padding-left: 1rem;
  margin: 1.5rem 0;
  font-style: italic;
  color: #555555;
}
.prose-custom table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}
.prose-custom th {
  text-align: left;
  padding: 0.625rem 1rem;
  background: #161616;
  color: #888888;
  font-weight: 500;
  border: 1px solid #272727;
}
.prose-custom td {
  padding: 0.625rem 1rem;
  border: 1px solid #272727;
  color: #888888;
}
.prose-custom tr:nth-child(even) td { background: rgba(22,22,22,0.5); }
.prose-custom hr {
  border: none;
  border-top: 1px solid #272727;
  margin: 2rem 0;
}
.prose-custom img {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 1rem 0;
}
.prose-custom pre {
  position: relative;
}
```

- [ ] **Step 3: Commit**

```bash
git add website/components/DocSection.tsx website/app/globals.css
git commit -m "feat(website): add DocSection with prose-custom styles"
```

---

## Task 16: DocsLayout client component

**Files:**
- Create: `website/components/DocsLayout.tsx`

- [ ] **Step 1: Create `website/components/DocsLayout.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { DocFile } from '@/lib/docs'

interface DocsLayoutProps {
  docs: DocFile[]
  children: React.ReactNode
}

export function DocsLayout({ docs, children }: DocsLayoutProps) {
  const [activeId, setActiveId] = useState<string>(docs[0]?.id ?? '')

  useEffect(() => {
    const observers: IntersectionObserver[] = []

    docs.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (!el) return

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id)
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
      )
      observer.observe(el)
      observers.push(observer)
    })

    return () => observers.forEach((o) => o.disconnect())
  }, [docs])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col fixed top-14 left-0 w-60 h-[calc(100vh-3.5rem)] border-r border-border bg-bg-base overflow-y-auto">
        <div className="p-5">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
            Documentation
          </p>
          <nav aria-label="Documentation sections">
            <ul className="space-y-1">
              {docs.map(({ id, label }) => (
                <li key={id}>
                  <button
                    onClick={() => scrollTo(id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors border-l-2 ${
                      activeId === id
                        ? 'border-accent text-text-primary bg-accent/5'
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                    }`}
                    aria-current={activeId === id ? 'location' : undefined}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      {/* Mobile top tab bar */}
      <div className="md:hidden sticky top-14 z-40 w-full bg-bg-base border-b border-border overflow-x-auto">
        <div className="flex">
          {docs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`flex-shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeId === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              aria-current={activeId === id ? 'location' : undefined}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <main
        id="main-content"
        className="flex-1 md:ml-60 pt-14 min-h-screen"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/components/DocsLayout.tsx
git commit -m "feat(website): add DocsLayout with IntersectionObserver sidebar"
```

---

## Task 17: Docs page

**Files:**
- Create: `website/app/docs/page.tsx`

- [ ] **Step 1: Create `website/app/docs/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { getAllDocs } from '@/lib/docs'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { DocsLayout } from '@/components/DocsLayout'
import { DocSection } from '@/components/DocSection'

export const metadata: Metadata = {
  title: 'Docs',
  description: 'Full documentation for Boop Agent — architecture, integrations, contributing guide, and changelog.',
}

export default async function DocsPage() {
  const docs = await getAllDocs()

  return (
    <>
      <Navbar />
      <DocsLayout docs={docs}>
        {docs.map((doc) => (
          <DocSection key={doc.id} doc={doc} />
        ))}
      </DocsLayout>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add website/app/docs/page.tsx
git commit -m "feat(website): add docs page — ISR fetch, sidebar, markdown sections"
```

---

## Task 18: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

```bash
cd website && npm run typecheck
```

Expected: `0 errors`.

- [ ] **Step 2: Run build**

```bash
cd website && npm run build
```

Expected: build completes with no errors. You should see routes for `/`, `/docs`, `/og`, `/sitemap.xml`, `/robots.txt`.

- [ ] **Step 3: Fix any import errors in `lib/docs.ts`**

If `remark` default export causes a type error, install and use `remark-parse` directly:

```bash
cd website && npm install remark-parse
```

Then update `website/lib/docs.ts` — change the import and usage:

```ts
// Remove: import remarkParse from 'remark'
import remarkParse from 'remark-parse'
// The .use(remarkParse) call stays the same
```

- [ ] **Step 4: Fix any `rehype-pretty-code` peer dep warnings**

If `rehype-pretty-code` version mismatch, pin to a compatible version:

```bash
cd website && npm install rehype-pretty-code@0.13.2
```

- [ ] **Step 5: Smoke test locally**

```bash
cd website && npm run dev
```

Open `http://localhost:3000` — verify:
- Navbar renders with logo and links
- Hero section shows mascot image, H1, both CTA buttons
- Architecture ASCII block and 4 component cards render
- Features grid shows 12 cards
- Quickstart numbered steps with copy buttons
- Prerequisites table renders with links

Open `http://localhost:3000/docs` — verify:
- Sidebar visible on desktop, top tab bar on mobile
- All 5 doc sections render with markdown
- Clicking a sidebar item scrolls to section and highlights it

- [ ] **Step 6: Final commit**

```bash
git add website/
git commit -m "feat(website): complete Boop Agent marketing website — landing + docs"
```

---

## Known edge cases to watch

1. **`remark` vs `remark-parse`:** `remark@15` exports `remark` as default (a preset). For the unified pipeline, use `remark-parse` (just the parser) instead to avoid double-processing.

2. **`rehype-pretty-code` + `shiki` versions:** `rehype-pretty-code@0.14` requires `shiki@1.x`. If version conflicts appear, run `npm ls shiki` in `website/` to verify.

3. **`next/font/google` in layout:** The font variables (`--font-inter`, `--font-jetbrains`) must be applied on the `<html>` element (done in layout.tsx). The CSS `var()` references in `globals.css` depend on this.

4. **OG route:** The `/og` route uses `next/og` (`ImageResponse`). This requires `next@14.x` — no extra install needed.

5. **`'use client'` boundary:** `DocsLayout`, `Navbar`, and `CopyButton` are client components. `DocSection`, all section components, and the page files themselves are server components. Never import a server component from a client component.

6. **Images in markdown:** The README contains `<img>` tags with `assets/` relative paths that won't resolve on the docs page (they point to the GitHub repo). This is expected behavior — images in the rendered markdown will 404. Only the `boop.png` in `public/` is served by Next.js.
