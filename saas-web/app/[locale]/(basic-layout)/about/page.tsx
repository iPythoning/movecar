import MDXComponents from "@/components/mdx/MDXComponents";
import AboutEn from "@/content/about/en.mdx";
import AboutJa from "@/content/about/ja.mdx";
import AboutZh from "@/content/about/zh.mdx";
import { Locale, LOCALES } from "@/i18n/routing";
import { constructMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

const aboutContent = {
  en: AboutEn,
  zh: AboutZh,
  ja: AboutJa,
};

type Params = Promise<{
  locale: string;
}>;

type MetadataProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });

  return constructMetadata({
    page: "About",
    title: t("title"),
    description: t("description"),
    locale: locale as Locale,
    path: `/about`,
  });
}

export default async function Page({ params }: { params: Params }) {
  const { locale } = await params;
  if (!Object.hasOwn(aboutContent, locale)) notFound();
  const Content = aboutContent[locale as keyof typeof aboutContent];

  return (
    <article className="container max-w-7xl mx-auto">
      <Content components={MDXComponents} />
    </article>
  );
}

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({
    locale,
  }));
}
