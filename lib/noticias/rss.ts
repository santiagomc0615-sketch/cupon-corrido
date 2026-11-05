/* Lectura de RSS 2.0 (título, enlace, fecha, fuente). Función pura, sin dependencias. */

export interface Titular {
  titulo: string;
  enlace: string;
  /** Fecha ISO (UTC). */
  fecha: string;
  /** Medio o entidad que publica (de <source> o del nombre del grupo). */
  fuente: string;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Quita CDATA, etiquetas HTML y decodifica entidades. */
export function textoPlano(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const etiqueta = (item: string, nombre: string) => {
  const m = item.match(new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, "i"));
  return m ? textoPlano(m[1]) : "";
};

/** Solo enlaces http(s): evita javascript: u otros esquemas en el HTML. */
const enlaceSeguro = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

export function leerRSS(xml: string, fuentePorDefecto: string): Titular[] {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const out: Titular[] = [];
  for (const it of items) {
    const titulo = etiqueta(it, "title");
    const enlace = enlaceSeguro(etiqueta(it, "link") || etiqueta(it, "guid"));
    const t = Date.parse(etiqueta(it, "pubDate") || etiqueta(it, "dc:date"));
    if (!titulo || !enlace || !Number.isFinite(t)) continue;
    const fuenteCruda = etiqueta(it, "source");
    // Algunos medios publican el nombre con separadores ("| Banco de la República")
    const fuente = fuenteCruda.replace(/^[\s|·–—-]+|[\s|·–—-]+$/g, "") || fuentePorDefecto;
    // Google Noticias agrega " - Medio" al final del título
    let limpio = titulo;
    for (const f of [fuenteCruda, fuente]) if (f && limpio.endsWith(" - " + f)) limpio = limpio.slice(0, -(f.length + 3));
    limpio = limpio.replace(/[\s|·–—-]+$/, "");
    out.push({ titulo: limpio, enlace, fecha: new Date(t).toISOString(), fuente });
  }
  return out;
}

/** Más recientes primero, sin títulos repetidos, dentro de una ventana de días. */
export function seleccionar(ts: Titular[], { max, dias, ahora = Date.now() }: { max: number; dias: number; ahora?: number }): Titular[] {
  const vistos = new Set<string>();
  return ts
    .filter((t) => Date.parse(t.fecha) >= ahora - dias * 864e5 && Date.parse(t.fecha) <= ahora + 864e5)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .filter((t) => {
      const k = t.titulo.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, max);
}
