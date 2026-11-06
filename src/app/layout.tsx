import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
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
        <footer
          className="app-footer"
          style={{
            maxWidth: "1500px",
            margin: "0 auto",
            padding: "0.8rem 0.8rem 1.6rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem 1rem",
            fontSize: "0.72rem",
            color: "var(--text-secondary)",
          }}
        >
          <span>© Katalyse</span>
          <Link href="/legal" style={{ color: "var(--text-secondary)" }}>運営者情報・規約・プライバシー</Link>
          <Link href="/security" style={{ color: "var(--text-secondary)" }}>セキュリティ</Link>
          <Link href="/legal#contact" style={{ color: "var(--text-secondary)" }}>お問い合わせ・批判の窓口</Link>
        </footer>
        <FeedbackWidget />
      </body>
    </html>
  );
}
