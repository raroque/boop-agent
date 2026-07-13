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
          <Link
            href="/#quickstart"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
          >
            Quick start
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
            <Link
              href="/#quickstart"
              className="text-sm text-text-secondary hover:text-text-primary py-1"
              onClick={() => setOpen(false)}
            >
              Quick start
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
