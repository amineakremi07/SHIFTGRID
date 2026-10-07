import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Splash } from "@/components/brand/splash";
import { SPLASH_SKIP_SCRIPT } from "@/lib/splash";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShiftGrid — Book sports courts in Tunisia",
  description:
    "Reserve padel, tennis and football courts across Tunisia. Live availability, instant slot locking, priced in TND.",
  applicationName: "ShiftGrid",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "ShiftGrid", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#50C878",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Skip the splash for the rest of the session (runs before first paint). */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SKIP_SCRIPT }} />
        <noscript>
          <style>{"#sg-splash{display:none}"}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col">
        <Splash />
        <PostHogProvider>{children}</PostHogProvider>
        <Toaster position="top-center" />
        <ConsentBanner />
      </body>
    </html>
  );
}
