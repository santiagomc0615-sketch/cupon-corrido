/* Titulares para /noticias, leídos desde el servidor y guardados en caché 30 minutos.
   - Bloomberg Línea: RSS oficial (un solo feed); se separa por sección según la URL de la nota.
   - Fuentes oficiales (BanRep, DANE, MinHacienda): sus portales no publican un RSS vigente, así que se
     usa el RSS de Google Noticias limitado a cada sitio oficial (últimos 30 días). */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { leerRSS, seleccionar, type Titular } from "./rss";

export interface GrupoNoticias {
  id: string;
  nombre: string;
  /** Fuente del listado (para mostrar). */
  via: string;
  /** Página de la fuente para abrir si el RSS falla. */
  portada: string;
  titulares: Titular[];
  error?: string;
}

export interface Noticias {
  grupos: GrupoNoticias[];
  /** Fecha y hora (Bogotá) de la lectura. */
  leidas: string;
}

const BLOOMBERG = "https://www.bloomberglinea.com/arc/outboundfeeds/rss/?outputType=xml";
const google = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`;

const OFICIALES: { sitio: string; nombre: string }[] = [
  { sitio: "banrep.gov.co", nombre: "Banco de la República" },
  { sitio: "dane.gov.co", nombre: "DANE" },
  { sitio: "minhacienda.gov.co", nombre: "Ministerio de Hacienda" },
];

async function feed(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function obtenerNoticias(): Promise<Noticias> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86_400 });
  cacheTag("noticias");

  const [bl, ...oficiales] = await Promise.allSettled([
    feed(BLOOMBERG),
    ...OFICIALES.map((o) => feed(google(`site:${o.sitio} when:30d`))),
  ]);

  const grupos: GrupoNoticias[] = [];
  const blTit = bl.status === "fulfilled" ? leerRSS(bl.value, "Bloomberg Línea") : [];
  const porSeccion = (re: RegExp) => seleccionar(blTit.filter((t) => re.test(new URL(t.enlace).pathname)), { max: 8, dias: 14 });
  grupos.push(
    {
      id: "bl-colombia",
      nombre: "Bloomberg Línea · Colombia",
      via: "RSS de Bloomberg Línea",
      portada: "https://www.bloomberglinea.com/latinoamerica/colombia/",
      titulares: porSeccion(/^\/latinoamerica\/colombia\//),
      error: bl.status === "rejected" ? mensaje(bl.reason) : undefined,
    },
    {
      id: "bl-mercados",
      nombre: "Bloomberg Línea · Mercados",
      via: "RSS de Bloomberg Línea",
      portada: "https://www.bloomberglinea.com/mercados/",
      titulares: porSeccion(/^\/mercados\//),
      error: bl.status === "rejected" ? mensaje(bl.reason) : undefined,
    },
  );

  const oficialesTit: Titular[] = [];
  const errores: string[] = [];
  oficiales.forEach((r, i) => {
    if (r.status === "fulfilled") oficialesTit.push(...leerRSS(r.value, OFICIALES[i].nombre));
    else errores.push(`${OFICIALES[i].nombre}: ${mensaje(r.reason)}`);
  });
  grupos.push({
    id: "oficiales",
    nombre: "Fuentes oficiales",
    via: "BanRep, DANE y MinHacienda vía Google Noticias",
    portada: "https://www.banrep.gov.co/es/noticias",
    titulares: seleccionar(oficialesTit, { max: 10, dias: 30 }),
    error: errores.length === OFICIALES.length ? errores.join(" · ") : undefined,
  });

  for (const g of grupos) if (g.error) console.warn(`[noticias] ${g.nombre}: ${g.error}`);

  return {
    grupos,
    leidas: new Date().toLocaleString("sv-SE", { timeZone: "America/Bogota", hour12: false }).slice(0, 16),
  };
}
