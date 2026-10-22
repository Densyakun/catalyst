import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Suspense } from "react";
import { ActivityTracker } from "@/components/ActivityTracker";
import FeedbackWidget from "@/components/FeedbackWidget";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Katalyse | AI Task Architecture",
  description: "AI-driven architecture for structuring and solving complex problems.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <Suspense fallback={null}>
          <ActivityTracker />
        </Suspense>
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
