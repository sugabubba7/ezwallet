import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PageBackdrop } from "@/components/PageBackdrop";
import { AuthProvider } from "@/lib/auth";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "EZ Wallet: LLM Data Wallet",
  description: "Encrypted context vault and zero-data-retention Gemini proxy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="font-sans">
        <PageBackdrop />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
