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
