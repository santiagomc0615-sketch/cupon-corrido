"use client";
import { useApp } from "@/components/providers/AppProvider";
import { Encabezado, Panel } from "@/components/ui";
import { F, nf } from "@/lib/format";

const ENLACES: [string, string, string, string][] = [
  ["Noticias", "Bloomberg Línea · Colombia", "Mercados, BanRep, inflación y deuda pública en español.", "https://www.bloomberglinea.com/latinoamerica/colombia/"],
  ["Noticias", "Bloomberg Línea · Mercados", "Bonos, divisas y tasas de América Latina.", "https://www.bloomberglinea.com/mercados/"],
  ["Oficial", "Banco de la República · Estadísticas", "TPM, IBR, UVR, TRM, encuesta de expectativas.", "https://www.banrep.gov.co/es/estadisticas"],
  ["Oficial", "DANE · Índice de precios al consumidor", "Boletín mensual del IPC y series históricas.", "https://www.dane.gov.co/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc"],
  ["Datos abiertos", "datos.gov.co", "Portal de datos abiertos con API (TRM, tasas, series del Estado).", "https://www.datos.gov.co"],
  ["Análisis", "BBVA Research · Decisión BanRep oct-2026", "Nota del 30-oct-2026: tasa en 12,25 %.", "https://www.bbvaresearch.com/publicaciones/colombia-banrep-mantuvo-la-tasa-en-1225-en-su-reunion-de-octubre/"],
  ["Noticias", "Noticias RCN · IPC septiembre 2026", "Inflación anual de 6,29 % en septiembre.", "https://www.noticiasrcn.com/economia/inflacion-anual-en-colombia-llego-al-6-29-en-septiembre-1069516"],
];

export function VistaNoticias() {
  const { snap, mk, motor } = useApp();
  const { macro } = snap;
  const M = motor.mercado;
  const filas: [string, string, string, string, string][] = [
    ["Tasa de política", "BanRep", macro.tpmFecha, F.pct(macro.tpm, 2), "Tras cada junta directiva"],
    ["IPC 12 meses", "DANE", mk.ipcLast.f, F.pct(mk.ipcLast.annual, 2), "Mensual, ~5.º día hábil"],
    ["IBR (ON a 12M)", "BanRep", mk.ibrLast.f, nf(3).format(mk.ibrLast.d[1]) + "%", "Diaria"],
    ["UVR", "BanRep", mk.ultimaUVR.f, nf(4).format(mk.ultimaUVR.d[1]), "Mensual (serie diaria)"],
    ["Curva TES", "SEN / proveedor de precios", M.curveDate, mk.tesSorted.length + " referencias", "Diaria"],
    ["Expectativas de inflación", "Encuesta BanRep", M.exp[0].f, M.exp.length + " meses", "Mensual"],
  ];
  return (
    <section className="view">
      <Encabezado
        eyebrow="Monitor de información"
        lede="Bloomberg Línea y los portales oficiales no permiten incrustarse dentro de otra página, así que aquí se abren en una pestaña nueva. Más adelante esta sección mostrará sus titulares (RSS) con fecha y enlace."
      >
        Noticias y <em>fuentes</em>
      </Encabezado>
      <div className="links">
        {ENLACES.map(([tipo, titulo, desc, url]) => (
          <a key={url} className="link" href={url} target="_blank" rel="noopener noreferrer">
            <em>{tipo}</em>
            <b>{titulo} ↗</b>
            <span>{desc}</span>
          </a>
        ))}
      </div>
      <Panel titulo="Estado de los datos de la calculadora">
        <div className="tbl" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Serie</th>
                <th>Fuente</th>
                <th>Último dato</th>
                <th>Valor</th>
                <th>Actualización prevista</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f[0]}>
                  <td className="t">{f[0]}</td>
                  <td className="t">{f[1]}</td>
                  <td>{f[2]}</td>
                  <td>{f[3]}</td>
                  <td className="t">{f[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
