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
