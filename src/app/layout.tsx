import type { Metadata } from "next";
import "./globals.css";
import ProtectedLayout from "@/components/ProtectedLayout";

export const metadata: Metadata = {
  title: "Inspira360 Revenue · Gelir Operasyonları Platformu",
  description: "Adaydan tahsilata gelir yönetimi: satış, teklif, bayi ve franchise kanalı, kârlılık ve müşteri başarısı.",
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
