import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import "./globals.css";

import { DevPanel } from "@/components/dev-panel/dev-panel";
import { Toaster } from "@/components/ui/sonner";

// globals.css reads --font-sans / --font-geist-mono for the Tailwind font-sans / font-mono classes.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interview Practice",
  description: "Practice job interviews with an AI interviewer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
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
