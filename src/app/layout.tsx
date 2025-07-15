import "leaflet/dist/leaflet.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Use Inter font
import "./globals.css";

// Initialize Inter font
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Monitoramento de Incêndios Florestais',
  description: 'Monitoramento de incêndios florestais em tempo real'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark">
      {/* Use Inter font class */}
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  )
}

