import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppProvider } from "@/components/providers/AppProvider";
import { CintaMercado } from "@/components/shell/CintaMercado";
import { Riel } from "@/components/shell/Riel";
import { SCRIPT_TEMA } from "@/components/shell/SelectorTema";
import { obtenerMercado } from "@/lib/data/mercado";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-bodoni",
  display: "swap",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Cupón Corrido", template: "%s · Cupón Corrido" },
  description:
    "Calculadora académica de renta fija colombiana: valoración de bonos tasa fija, IBR, IPC y UVR, portafolio, curva TES y datos de mercado.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E9EDE8" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1411" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const snap = await obtenerMercado();
  return (
    <html
      lang="es-CO"
      className={`${bodoni.variable} ${plexSans.variable} ${plexMono.variable}`}
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
                  <span>Herramienta académica, no es asesoría financiera.</span>
                  <span>
                    Datos: BanRep, DANE y curva TES cargados del Excel del curso
                    {snap.origen === "respaldo" ? " (carga fija, sin actualización automática todavía)" : ""}.
                  </span>
                </footer>
              </div>
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
