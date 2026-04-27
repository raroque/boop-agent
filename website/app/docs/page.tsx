import type { Metadata } from 'next'
import { getAllDocs } from '@/lib/docs'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { DocsLayout } from '@/components/DocsLayout'
import { DocSection } from '@/components/DocSection'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Docs',
  description: 'Full documentation for Boop Agent — architecture, integrations, contributing guide, and changelog.',
}

export default async function DocsPage() {
  const docs = await getAllDocs()

  return (
    <>
      <Navbar />
      <DocsLayout docs={docs}>
        {docs.map((doc) => (
          <DocSection key={doc.id} doc={doc} />
        ))}
      </DocsLayout>
      <Footer />
    </>
  )
}
