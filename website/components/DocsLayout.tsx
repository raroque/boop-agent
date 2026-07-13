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
