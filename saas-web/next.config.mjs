import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  redirects: async () => [
    {
      source: "/dashboard",
      destination: "/dashboard/settings",
      permanent: true,
    },
    {
      source: "/zh/dashboard",
      destination: "/zh/dashboard/settings",
      permanent: true,
    },
    {
      source: "/ja/dashboard",
      destination: "/ja/dashboard/settings",
      permanent: true,
    },
  ],
  images: {
    unoptimized:
      process.env.NEXT_PUBLIC_OPTIMIZED_IMAGES &&
      process.env.NEXT_PUBLIC_OPTIMIZED_IMAGES === "false",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pic.wujieai.com',
      },
      ...(process.env.R2_PUBLIC_URL
        ? [
            {
              hostname: process.env.R2_PUBLIC_URL.replace("https://", ""),
            },
          ]
        : []),
    ],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error"],
          }
        : false,
  },
  // Pino uses worker threads for transports — must be treated as external in Next.js
  serverExternalPackages: ["pino", "pino-pretty", "pino-roll", "thread-stream"],
};

const withBundleAnalyzerWrapper = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

if (
  process.env.NODE_ENV === "development" &&
  !process.env.NEXTY_WELCOME_SHOWN
) {
  console.log("\n🎉 Welcome to NEXTY.DEV Boilerplate!");
  console.log("💬 Join our Discord community: https://discord.gg/VRDxBgXUZ8");
  console.log("📚 Documentation: https://nexty.dev/docs\n\n");
  process.env.NEXTY_WELCOME_SHOWN = "true";
}

const sentryConfig = {
  // Suppress noisy Sentry CLI output during build
  silent: !process.env.CI,
  // Upload source maps only when SENTRY_AUTH_TOKEN is set
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Automatically tree-shake Sentry logger statements in production
  disableLogger: true,
};

export default withSentryConfig(
  withPWA(withBundleAnalyzerWrapper(withNextIntl(nextConfig))),
  sentryConfig
);
