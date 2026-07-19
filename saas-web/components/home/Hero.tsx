import FeatureBadge from "@/components/shared/FeatureBadge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link as I18nLink } from "@/i18n/routing";
import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SiDiscord } from "react-icons/si";

export default function Hero() {
  const t = useTranslations("Landing.Hero");

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex gap-8 py-16 lg:py-24 2xl:py-40 items-center justify-center flex-col">
          <FeatureBadge
            label={t("badge.label")}
            text={t("badge.text")}
            href={t("badge.href")}
          />
          <div className="flex gap-4 flex-col max-w-4xl px-4 sm:px-0">
            <h1 className="text-center z-10 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-sans font-extrabold tracking-tight">
              <span className="title-gradient">{t("title")}</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground text-center mx-auto max-w-2xl">
              {t("description")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto px-6 sm:px-0">
            <Button
              asChild
              className="h-12 sm:h-14 rounded-full px-8 py-2 text-base font-semibold text-white border-2 border-primary bg-primary hover:bg-primary/90 shadow-lg hover:shadow-primary/25 transition-all w-full sm:w-auto"
            >
              <I18nLink
                href={t("getStartedLink") || "#"}
                className="flex items-center gap-2"
              >
                <MousePointerClick className="w-4 h-4" />
                {t("getStarted")}
              </I18nLink>
            </Button>
          </div>
          
          {/* Hero Image / Mockup using placeholder */}
          <div className="mt-12 sm:mt-20 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-border/50 bg-muted/20">
              {/* Added aspect ratio container to prevent CLS */}
              <div className="aspect-[16/9] w-full">
                <img 
                  src="https://pic.wujieai.com/x49R6Wl6B8Bv3p4sM8A9w8t0k0a2D9W2K5a0I7J6u6F1B9I1n5T1.jpg" 
                  alt="MoveCar App Mockup showing a smart parking QR code on a dashboard and a phone receiving an instant alert" 
                  className="w-full h-full object-cover"
                  fetchPriority="high"
                  loading="eager"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
