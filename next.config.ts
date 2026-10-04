import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { securityHeaders } from "./lib/security-headers";

/** Source maps are produced only when they will be uploaded to Sentry (and then deleted, never served). */
const sentryUpload = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

/** Release id shared by the build plugin and every runtime: explicit, else the Vercel commit SHA (else the plugin uses `git rev-parse HEAD`). */
const sentryRelease = process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined;

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next.js 16. An explicit (empty) config
  // opts in deliberately and silences the "webpack config with no turbopack
  // config" build error. Turbopack needs no loaders for our CSS/TS setup.
  turbopack: {},

  // Configure images to avoid remote image issues
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Performance optimizations
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-tabs',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-toast',
      'lucide-react',
      'date-fns',
      'zod',
    ],
    serverMinification: true,
    // Enable server actions body size limit
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Production optimizations
  compress: true,
  // Must be set explicitly from `sentryUpload`: a hard-coded `false` stops @sentry/nextjs from
  // enabling browser maps under Turbopack, so browser stack traces would stay minified.
  productionBrowserSourceMaps: sentryUpload,
  poweredByHeader: false,

  // Standalone output is only for self-hosting (`node .next/standalone/server.js`). On Vercel,
  // Next 16 builds through a deployment adapter (NEXT_ADAPTER_PATH), which does its own packaging
  // and does not write `.next/next-server.js.nft.json`; the standalone step then fails reading it
  // ("ENOENT ... next-server.js.nft.json"). Reproduced locally with any adapter set.
  output: process.env.VERCEL || process.env.NEXT_ADAPTER_PATH ? undefined : 'standalone',

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders(),
      },
      // Cache images
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // No cache for API routes
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },

};

// Sentry build step: wires instrumentation, injects the release id into every runtime and,
// when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set, creates the release, links its
// commits, marks the deploy, uploads source maps and then deletes them from the build, so stack
// traces are readable in Sentry while no map is ever served publicly (v11's replacement for the
// old `hideSourceMaps`). Without the token: no maps, no upload, no error.
// Do NOT set `release.create: false`: the SDK then also stops injecting the release name.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  release: {
    ...(sentryRelease ? { name: sentryRelease } : {}),
    finalize: true,
    // Needs Sentry's GitHub integration; without it this quietly does nothing.
    setCommits: { auto: true, ignoreMissing: true, ignoreEmpty: true },
    ...(process.env.VERCEL_ENV ? { deploy: { env: process.env.VERCEL_ENV } } : {}),
  },
  telemetry: false,
});
