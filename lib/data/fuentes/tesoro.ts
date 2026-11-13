/* Departamento del Tesoro de EE. UU. — curva de rendimientos par diaria (sin clave):
   https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=AAAAMM
   Se usa el nodo de 10 años (BC_10YEAR): rendimiento par con capitalización semestral, en %.
   Solo se usa desde el servidor. */

export interface UST10 {
  /** Fracción (0,0515), rendimiento par semestral como lo publica el Tesoro. */
  valor: number;
  /** Fecha del cierre (AAAA-MM-DD). */
  fecha: string;
}

const URL_MES = (aaaamm: string) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=${aaaamm}`;

/** Lee las fechas y el 10 años de un mes del XML del Tesoro. Función pura. */
export function leerTesoro10(xml: string): UST10[] {
  const out: UST10[] = [];
  for (const m of xml.matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)) {
    const fecha = m[1].match(/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/)?.[1];
    const v = m[1].match(/<d:BC_10YEAR[^>]*>([\d.]+)</)?.[1];
    // El Tesoro publica con 2 decimales en %: se pasa a fracción sin ruido binario (5.15 → 0,0515).
    if (fecha && v && Number.isFinite(+v)) out.push({ fecha, valor: Math.round(+v * 1e4) / 1e6 });
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** Rendimiento semestral → E.A.: (1 + y/2)² − 1. Para compararlo con el TES, que se cotiza en E.A. */
export const eaDesdeSemestral = (y: number) => Math.pow(1 + y / 2, 2) - 1;

const mesAnterior = (aaaamm: string) => {
  const y = +aaaamm.slice(0, 4),
    m = +aaaamm.slice(4, 6);
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, "0")}`;
};

async function mes(aaaamm: string): Promise<UST10[]> {
  const r = await fetch(URL_MES(aaaamm), { headers: { Accept: "application/xml" }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Tesoro EE. UU.: HTTP ${r.status}`);
  return leerTesoro10(await r.text());
}

/** Último cierre con fecha ≤ `fecha` (busca en ese mes y, si no hay, en el anterior). */
export async function ust10EnFecha(fecha: string): Promise<UST10> {
  let aaaamm = fecha.slice(0, 4) + fecha.slice(5, 7);
  for (let i = 0; i < 2; i++) {
    const filas = (await mes(aaaamm)).filter((x) => x.fecha <= fecha);
    if (filas.length) return filas[filas.length - 1];
    aaaamm = mesAnterior(aaaamm);
  }
  throw new Error(`Tesoro EE. UU.: sin 10 años hasta ${fecha}`);
}
