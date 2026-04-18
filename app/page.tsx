import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { SamplePreview } from "@/components/SamplePreview";
import { Waitlist } from "@/components/Waitlist";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <HowItWorks />
      <SamplePreview />
      <Waitlist />
      <Footer />
    </main>
  );
}
