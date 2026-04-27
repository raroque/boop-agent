import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeStringify from 'rehype-stringify'

export interface DocFile {
  id: string
  label: string
  html: string
}

const DOC_FILES = [
  { id: 'readme',       label: 'README',       url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/README.md' },
  { id: 'architecture', label: 'Architecture', url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/ARCHITECTURE.md' },
  { id: 'integrations', label: 'Integrations', url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/INTEGRATIONS.md' },
  { id: 'contributing', label: 'Contributing', url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/CONTRIBUTING.md' },
  { id: 'changelog',    label: 'Changelog',    url: 'https://raw.githubusercontent.com/raroque/boop-agent/main/CHANGELOG.md' },
]

async function parseMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypePrettyCode as any, {
      theme: 'github-dark',
      keepBackground: true,
    })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  return String(file)
}

export async function getAllDocs(): Promise<DocFile[]> {
  const results = await Promise.all(
    DOC_FILES.map(async ({ id, label, url }) => {
      const res = await fetch(url, { next: { revalidate: 3600 } })
      const markdown = res.ok ? await res.text() : `# ${label}\n\n*Could not load this document.*`
      const html = await parseMarkdown(markdown)
      return { id, label, html }
    })
  )
  return results
}
