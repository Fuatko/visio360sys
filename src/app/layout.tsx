import type { Metadata } from "next";
import "./globals.css";
import ProtectedLayout from "@/components/ProtectedLayout";

export const metadata: Metadata = {
  title: "SatışPro - Satış Yönetim Sistemi",
  description: "MFK Danışmanlık - Kurumsal Satış Yönetim Sistemi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="bg-slate-50 font-sans antialiased">
        <ProtectedLayout>{children}</ProtectedLayout>
      </body>
    </html>
  );
}
