import type { DocFile } from '@/lib/docs'

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
