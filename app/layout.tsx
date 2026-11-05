import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AppProvider } from "@/components/providers/AppProvider";
import { CintaMercado } from "@/components/shell/CintaMercado";
import { Riel } from "@/components/shell/Riel";
import { SCRIPT_TEMA } from "@/components/shell/SelectorTema";
import { BRAND } from "@/lib/brand";
import { obtenerMercado } from "@/lib/data/mercado";
import { clasesFuentes } from "./fuentes";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.dominio),
  title: { default: BRAND.nombre, template: `%s · ${BRAND.nombre}` },
  description: BRAND.descripcion,
  applicationName: BRAND.nombre,
  openGraph: { title: BRAND.nombre, description: BRAND.descripcion, siteName: BRAND.nombre, locale: "es_CO", type: "website" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.colorBarra.claro },
    { media: "(prefers-color-scheme: dark)", color: BRAND.colorBarra.oscuro },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const snap = await obtenerMercado();
  return (
    <html
      lang="es-CO"
      className={clasesFuentes}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <AppProvider snap={snap}>
          <div className="shell">
            <Riel />
            <main>
              <CintaMercado />
              <div className="wrap">
                {children}
                <footer className="site-foot">
                  <span>{BRAND.avisoLegal}</span>
                  <span>
                    {snap.origen === "en-vivo"
                      ? `Datos: BanRep (SDMX), datos.gov.co, DANE y series cargadas · actualizado ${snap.actualizado.replace(" ", " ")} (hora de Colombia).`
                      : "Datos: última carga del Excel del curso (las fuentes en vivo no respondieron)."}
                  </span>
                  <nav aria-label="Información legal">
                    <Link href="/privacidad">Privacidad</Link>
                    <Link href="/terminos">Términos</Link>
                  </nav>
                </footer>
              </div>
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
