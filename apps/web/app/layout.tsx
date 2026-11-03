import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Shared studio typography and timecode numerals.
const sans = localFont({
  src: "../../../packages/core/assets/fonts/DMSans-Variable.woff2",
  variable: "--font-dm-sans",
  weight: "400 1000",
  display: "swap",
});

const mono = localFont({
  src: "../../../packages/core/assets/fonts/GeistMono-Variable.woff2",
  weight: "400 600",
  variable: "--font-geist-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "podframes — animated AI podcast videos, with Codex and Fish Audio",
  description:
    "Turn a topic into a fully animated, AI-hosted podcast video. Generate two-host conversations with Fish Audio and local Codex, lip-sync each host to the real audio, and render with HyperFrames.",
  openGraph: {
    title: "podframes",
    description: "Topic → multi-provider conversation → animated podcast video.",
    url: siteUrl,
    siteName: "podframes",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "podframes" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
