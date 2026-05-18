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
    <section id="quickstart" className="py-20 px-4 scroll-mt-14" aria-label="Quickstart">
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
