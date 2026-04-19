import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Stories } from "@/components/Stories";
import { Companions } from "@/components/Companions";
import { SamplePreview } from "@/components/SamplePreview";
import { Waitlist } from "@/components/Waitlist";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <HowItWorks />
      <Stories />
      <Companions />
      <SamplePreview />
      <Waitlist />
      <Footer />
    </main>
  );
}
