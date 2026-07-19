import { getMessages } from "next-intl/server";
import dynamic from "next/dynamic";
import Hero from "@/components/home/Hero";
import { BG1 } from "@/components/shared/BGs";

// Lazy load non-critical components below the fold for better FCP/TTI
const Features = dynamic(() => import("@/components/home/Features"), { ssr: true });
const UseCases = dynamic(() => import("@/components/home/UseCases"), { ssr: true });
const PricingByGroup = dynamic(() => import("@/components/pricing").then(mod => mod.PricingByGroup), { ssr: true });
const FAQ = dynamic(() => import("@/components/home/FAQ"), { ssr: true });
const CTA = dynamic(() => import("@/components/home/CTA"), { ssr: true });

export default async function HomeComponent() {
  const messages = await getMessages();

  return (
    <div className="w-full">
      <BG1 />

      {messages.Landing.Hero && <Hero />}

      {messages.Landing.Features && <Features />}

      {messages.Landing.UseCases && <UseCases />}

      {messages.Pricing && <PricingByGroup />}

      {messages.Landing.FAQ && <FAQ />}

      {messages.Landing.CTA && <CTA />}
    </div>
  );
}
