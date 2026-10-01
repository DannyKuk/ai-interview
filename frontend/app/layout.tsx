import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import "./globals.css";

import { DevPanel } from "@/components/dev-panel/dev-panel";
import { Toaster } from "@/components/ui/sonner";

// globals.css reads --font-sans / --font-geist-mono / --font-display for the Tailwind font-sans /
// font-mono / font-heading classes. next/font downloads the files at build time
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Only for the few big words (page titles, card titles, the score). The opsz axis lets the letter
// shapes adapt to the size: tighter at text-3xl than at text-base.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Interview Practice",
  description: "Practice job interviews with an AI interviewer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
        <Suspense>
          <DevPanel />
        </Suspense>
      </body>
    </html>
  );
}
