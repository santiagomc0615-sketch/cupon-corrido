/* MARCA — nombre, eslogan, descripción, logo y dominio en un solo lugar.
   Todos los componentes y metadatos leen de aquí. Para cambiar el nombre de la página basta
   con editar este archivo. Los colores y tipografías están en app/globals.css y app/fuentes.ts. */

/** Nombre visible (riel, título de la pestaña, asesor). Cámbielo aquí. */
const NOMBRE = "Cupón Corrido";

export const BRAND = {
  nombre: NOMBRE,
  /** Eslogan corto bajo el nombre en el riel. */
  eslogan: "Mesa de renta fija · COL",
  /** Descripción para buscadores y redes. */
  descripcion:
    "Calculadora académica de renta fija colombiana: valoración de bonos tasa fija, IBR, IPC y UVR, portafolio, curva TES y datos de mercado.",
  /** Identificador técnico (sin espacios): prefijos de caché y almacenamiento. */
  slug: "cupon-corrido",
  /** Dominio público: NEXT_PUBLIC_SITIO_URL; si falta, la URL de producción que asigna Vercel; en local, localhost. */
  dominio:
    process.env.NEXT_PUBLIC_SITIO_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  /** Ruta de inicio (a dónde lleva el logo). */
  inicio: "/",
  /** Aviso legal visible en el riel y el pie. */
  avisoLegal: "Herramienta académica, no es asesoría financiera.",
  /** Responsable del tratamiento de datos (Ley 1581 de 2012). Aparece en /privacidad y /terminos. */
  responsable: {
    nombre: "Santiago",
    correo: "santiago.mc0615@gmail.com",
    contexto: "proyecto académico del curso Portafolio de Renta Fija",
    pais: "Colombia",
  },
  /** Fecha de la última actualización de /privacidad y /terminos. */
  fechaLegal: "5 de noviembre de 2026",
  /** Logo: sello guilloché dibujado en canvas con el color --engrave del tema. */
  logo: {
    alt: `Sello guilloché de ${NOMBRE}`,
    /** Parámetros del grabado del sello (riel). */
    sello: { R: 0.95, a: 0.32, n: 9, m: 2, lines: 14, alpha: 0.7, lw: 0.8 },
    /** Roseta grande del héroe de Mercado. */
    roseta: { R: 0.92, a: 0.22, n: 18, m: 3, lines: 46, alpha: 0.38, lw: 1 },
  },
  /** Color de la barra del navegador en celulares (debe coincidir con --paper de globals.css). */
  colorBarra: { claro: "#F6F7F9", oscuro: "#0B1220" },
} as const;
