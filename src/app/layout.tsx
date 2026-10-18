import type { Metadata, Viewport } from "next";
import "./globals.css";
import ProtectedLayout from "@/components/ProtectedLayout";

export const metadata: Metadata = {
  title: "Inspira360 Revenue · Gelir Operasyonları Platformu",
  description: "Adaydan tahsilata gelir yönetimi: satış, teklif, bayi ve franchise kanalı, kârlılık ve müşteri başarısı.",
  // Telefona "Ana ekrana ekle" (PWA): manifest ve ikonlar public/ altında
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Inspira360", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1B3A5C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="bg-[#f6f8fb] font-sans antialiased">
        <ProtectedLayout>{children}</ProtectedLayout>
      </body>
    </html>
  );
}
