"use client";
import { TablaFuentes } from "@/components/datos/EstadoFuentes";
import { useApp } from "@/components/providers/AppProvider";
import { Encabezado, Panel } from "@/components/ui";
import { MESES } from "@/lib/format";
import type { GrupoNoticias, Noticias } from "@/lib/noticias/obtener";

/** "5·nov · 17:35" en hora de Colombia (igual en servidor y navegador). */
const fechaHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function cuando(iso: string): string {
  const p = Object.fromEntries(fechaHora.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${+p.day}·${MESES[+p.month - 1]} · ${p.hour}:${p.minute}`;
}

function Grupo({ g }: { g: GrupoNoticias }) {
  return (
    <Panel titulo={g.nombre} src={g.via}>
      {g.titulares.length ? (
        <ol className="titulares">
          {g.titulares.map((t) => (
            <li key={t.enlace}>
              <a href={t.enlace} target="_blank" rel="noopener noreferrer">
                {t.titulo}
              </a>
              <span className="src">
                {t.fuente} · {cuando(t.fecha)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="src">
          {g.error ? "No se pudo leer el RSS en este momento. " : "Sin titulares recientes. "}
          <a href={g.portada} target="_blank" rel="noopener noreferrer">
            Abrir la fuente ↗
          </a>
        </p>
      )}
    </Panel>
  );
}

const ENLACES: [string, string, string, string][] = [
  ["Noticias", "Bloomberg Línea · Colombia", "Mercados, BanRep, inflación y deuda pública en español.", "https://www.bloomberglinea.com/latinoamerica/colombia/"],
  ["Noticias", "Bloomberg Línea · Mercados", "Bonos, divisas y tasas de América Latina.", "https://www.bloomberglinea.com/mercados/"],
  ["Oficial", "Banco de la República · Estadísticas", "TPM, IBR, UVR, TRM, encuesta de expectativas.", "https://www.banrep.gov.co/es/estadisticas"],
  ["Oficial", "DANE · Índice de precios al consumidor", "Boletín mensual del IPC y series históricas.", "https://www.dane.gov.co/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc"],
  ["Datos abiertos", "datos.gov.co", "Portal de datos abiertos con API (TRM, tasas, series del Estado).", "https://www.datos.gov.co"],
  ["Análisis", "BBVA Research · Decisión BanRep oct-2026", "Nota del 30-oct-2026: tasa en 12,25 %.", "https://www.bbvaresearch.com/publicaciones/colombia-banrep-mantuvo-la-tasa-en-1225-en-su-reunion-de-octubre/"],
  ["Noticias", "Noticias RCN · IPC septiembre 2026", "Inflación anual de 6,29 % en septiembre.", "https://www.noticiasrcn.com/economia/inflacion-anual-en-colombia-llego-al-6-29-en-septiembre-1069516"],
];

export function VistaNoticias({ noticias }: { noticias: Noticias }) {
  const { snap } = useApp();
  return (
    <section className="view">
      <Encabezado
        eyebrow="Monitor de información"
        lede="Últimos titulares leídos desde el servidor por RSS (se actualizan cada 30 minutos). Cada enlace abre la nota original en una pestaña nueva."
      >
        Noticias y <em>fuentes</em>
      </Encabezado>
      <div className="grid-c g3">
        {noticias.grupos.map((g) => (
          <Grupo key={g.id} g={g} />
        ))}
      </div>
      <p className="src" style={{ marginTop: -10 }}>
        Titulares leídos el {noticias.leidas.replace(" ", " a las ")} (hora de Colombia). Los portales del BanRep, el DANE y
        MinHacienda no publican un RSS vigente; sus titulares vienen del RSS de Google Noticias limitado a cada sitio oficial.
      </p>
      <h2 className="h-sub" style={{ marginTop: 6 }}>
        Portales y análisis
      </h2>
      <div className="links">
        {ENLACES.map(([tipo, titulo, desc, url]) => (
          <a key={url} className="link" href={url} target="_blank" rel="noopener noreferrer">
            <em>{tipo}</em>
            <b>{titulo} ↗</b>
            <span>{desc}</span>
          </a>
        ))}
      </div>
      <Panel titulo="Estado de los datos de la calculadora" src={`Actualizado ${snap.actualizado.replace(" ", " · ")} (hora de Colombia)`}>
        <TablaFuentes />
        <p className="src" style={{ marginTop: 10 }}>
          En vivo: servicio SDMX del Banco de la República (totoro.banrep.gov.co) y datos.gov.co, consultados desde el
          servidor una vez al día. Si una fuente no responde, esa serie usa la última carga del Excel del curso.
        </p>
      </Panel>
    </section>
  );
}
