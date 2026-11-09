import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes locales (variables, 100-900): bajarlas de Google en el build rompe el
// deploy (Turbopack, "next/font/google queries have exactly one entry"), como
// pasó con Syne y Manrope en los portales.
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "SUPRICOM - Panel Administrativo",
  description: "Panel Administrativo SUPRICOM",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png", // Estándar para pestañas
        sizes: "32x32",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        sizes: "32x32",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg", // Los navegadores modernos prefieren el SVG porque escala mejor
        type: "image/svg+xml",
      },
    ],
    // Para cuando guardan la web en el escritorio del celular (se ve grande)
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="font-sans antialiased bg-background text-foreground"
        suppressHydrationWarning
      >
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
