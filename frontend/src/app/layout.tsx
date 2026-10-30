import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { PageBackdrop } from "@/components/PageBackdrop";
import { AuthProvider } from "@/lib/auth";

const sans = Montserrat({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "EZ Wallet: prompt once, pivot anywhere",
  description: "Carry your context from one AI tool to the next. Your chats stay in your browser.",
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
