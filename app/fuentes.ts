/* TIPOGRAFÍAS — las familias de la página. Para cambiar una fuente, cambie aquí el import y la
   llamada (next/font descarga la fuente al compilar y la sirve desde el propio sitio).
   Los nombres de variable (--font-*-web) los usan los tokens --f-display, --f-body, --f-cifra y
   --f-mono de app/globals.css; no hace falta tocar nada más. */
import { Bodoni_Moda, Geist, Geist_Mono, IBM_Plex_Sans } from "next/font/google";

/** Títulos */
export const fuenteDisplay = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-display-web",
  display: "swap",
});

/** Texto */
export const fuenteTexto = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body-web",
  display: "swap",
});

/** Cifras grandes: precio, TIR, valor, ganancia e indicadores (600, números tabulares). */
export const fuenteCifra = Geist({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cifra-web",
  display: "swap",
});

/** Tablas y datos (500, tabular) */
export const fuenteMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-web",
  display: "swap",
});

/** Clases para el <html>: activan las variables. */
export const clasesFuentes = `${fuenteDisplay.variable} ${fuenteTexto.variable} ${fuenteCifra.variable} ${fuenteMono.variable}`;
