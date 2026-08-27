import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Nóminas, gastos, suscripciones y calendario en un único sitio.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e1116",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-24 sm:px-6">
          <header className="flex flex-wrap items-center justify-between gap-4 py-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-lg">€</span>
              <span className="text-lg font-semibold tracking-tight">Finanzas</span>
            </Link>
            <Nav />
          </header>
          <main className="flex-1">{children}</main>
          <footer className="pt-10 text-xs text-muted">
            Los datos viven solo en tu SQLite local. Nada sale de este equipo salvo las
            llamadas al proveedor bancario y a tu servicio de notificaciones.
          </footer>
        </div>
      </body>
    </html>
  );
}
