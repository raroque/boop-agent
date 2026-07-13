'use client'

import { useEffect, useRef, useState } from 'react'

const DIAGRAM = `flowchart LR
    A["📱 iMessage"] -->|inbound| B["Sendblue\\nWebhook"]
    B --> C["Interaction\\nAgent"]
    C -->|spawns| D["Sub-agents\\n(per task)"]
    C <-->|memory| E[("Memory\\nConvex")]
    D <-->|tools| F["Integrations\\nComposio"]`

const FALLBACK = ` iMessage  →  Sendblue webhook  →  Interaction agent  →  Sub-agents (per task)
                                        │                    │
                                        ▼                    ▼
                                  Memory store  ←──  Integrations (your MCP tools)`

export function MermaidDiagram() {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#161616',
            primaryTextColor: '#f0f0f0',
            primaryBorderColor: '#272727',
            lineColor: '#555555',
            secondaryColor: '#1f1f1f',
            tertiaryColor: '#0e0e0e',
            background: '#0e0e0e',
            mainBkg: '#161616',
            nodeBorder: '#272727',
            clusterBkg: '#161616',
            edgeLabelBackground: '#161616',
            nodeTextColor: '#f0f0f0',
            titleColor: '#f0f0f0',
            labelTextColor: '#f0f0f0',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          },
          flowchart: { curve: 'basis', padding: 20 },
        })

        // Unique id per render to avoid mermaid caching issues
        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, DIAGRAM)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          // Make SVG responsive
          const svgEl = ref.current.querySelector('svg')
          if (svgEl) {
            svgEl.removeAttribute('width')
            svgEl.removeAttribute('height')
            svgEl.style.maxWidth = '100%'
            svgEl.style.height = 'auto'
          }
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    render()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <pre className="font-mono text-xs text-status-green bg-[#111] border border-border rounded-lg p-4 sm:p-6 overflow-x-auto whitespace-pre leading-relaxed">
        {FALLBACK}
      </pre>
    )
  }

  return (
    <div
      ref={ref}
      className="w-full bg-[#111] border border-border rounded-xl p-4 sm:p-8 overflow-x-auto flex items-center justify-center min-h-[180px]"
      aria-label="Architecture diagram"
    />
  )
}
