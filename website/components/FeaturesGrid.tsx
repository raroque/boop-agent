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
