import { Navbar } from '@/components/Navbar'
import { Hero } from '@/components/Hero'
import { ArchitectureBlock } from '@/components/ArchitectureBlock'
import { FeaturesGrid } from '@/components/FeaturesGrid'
import { QuickstartBlock } from '@/components/QuickstartBlock'
import { PrerequisitesTable } from '@/components/PrerequisitesTable'
import { Footer } from '@/components/Footer'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <ArchitectureBlock />
        <FeaturesGrid />
        <QuickstartBlock />
        <PrerequisitesTable />
      </main>
      <Footer />
    </>
  )
}
