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
