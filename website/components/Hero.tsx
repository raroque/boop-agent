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
