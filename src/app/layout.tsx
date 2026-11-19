import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Search from "@/components/Search";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Guía de La Prisión",
    template: "%s · Guía de La Prisión",
  },
  description:
    "El catálogo de La Prisión: objetos, NPCs, recetas, vendedores y el plano "
    + "de la cárcel, sacados del propio *.gamedata del servidor.",
};

const NAV = [
  { href: "/objetos", label: "Objetos" },
  { href: "/npcs", label: "NPCs" },
  { href: "/recetas", label: "Recetas" },
  { href: "/vendedores", label: "Vendedores" },
  { href: "/salas", label: "Salas" },
  { href: "/mapa", label: "Mapa" },
  { href: "/delitos", label: "Delitos" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-text group-hover:text-amber">
                La Prisión
              </span>
              <span className="hidden text-[11px] tracking-[0.14em] text-faint uppercase sm:block">
                guía
              </span>
            </Link>

            <nav className="order-3 -mx-1 flex w-full flex-1 gap-1 overflow-x-auto text-[13px] sm:order-2 sm:mx-0 sm:w-auto">
              {NAV.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="rounded px-2 py-1 whitespace-nowrap text-dim transition-colors hover:bg-panel hover:text-amber"
                >
                  {entry.label}
                </Link>
              ))}
            </nav>

            <div className="order-2 ml-auto sm:order-3">
              <Search />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
          {children}
        </main>

        <footer className="mt-10 border-t border-line">
          <div className="mx-auto max-w-[1400px] px-4 py-6 text-xs leading-relaxed text-faint">
            <p>
              Los datos salen del{" "}
              <code className="font-mono text-dim">*.gamedata</code> del
              servidor, leído con los mismos lectores que usa el servidor, y de
              los ficheros de configuración del cliente. Nada se ha copiado a
              mano ni se ha inventado: donde un número no tiene significado
              conocido, aquí sale como número.
            </p>
            <p className="mt-2">
              La Prisión / Prison Legacy es de sus autores. Esta guía no está
              afiliada con ellos.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
