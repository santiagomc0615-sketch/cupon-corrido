/* datos.gov.co (API Socrata) — Tasa de Cambio Representativa del Mercado (dataset 32sa-8pi3).
   Trae la TRM vigente, la anterior y la de hace un año (para la devaluación de los últimos 12 meses).
   Solo se usa desde el servidor. */

export interface TRM {
  valor: number;
  /** Fecha de vigencia ISO */
  fecha: string;
  anterior?: number;
  /** TRM vigente un año antes de `fecha` (o el último día hábil anterior). */
  hace12m?: { valor: number; fecha: string };
}

const BASE = "https://www.datos.gov.co/resource/32sa-8pi3.json";
type Fila = { valor: string; vigenciadesde: string };

async function consultar(query: string): Promise<Fila[]> {
  const r = await fetch(`${BASE}?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`datos.gov.co TRM: HTTP ${r.status}`);
  return (await r.json()) as Fila[];
}

/** Misma fecha un año antes ("2026-11-11" → "2025-11-11"; 29-feb → 28-feb). */
export function haceUnAnio(fecha: string): string {
  const y = +fecha.slice(0, 4) - 1;
  const md = fecha.slice(5) === "02-29" ? "02-28" : fecha.slice(5);
  return `${y}-${md}`;
}

export async function trmDatosGov(): Promise<TRM> {
  const filas = await consultar("$order=vigenciadesde%20DESC&$limit=2");
  if (!filas.length) throw new Error("datos.gov.co TRM: sin datos");
  const fecha = filas[0].vigenciadesde.slice(0, 10);
  let hace12m: TRM["hace12m"];
  try {
    const antes = haceUnAnio(fecha);
    const [f] = await consultar(`$where=vigenciadesde%20%3C%3D%20'${antes}T00:00:00.000'&$order=vigenciadesde%20DESC&$limit=1`);
    if (f) hace12m = { valor: Number(f.valor), fecha: f.vigenciadesde.slice(0, 10) };
  } catch {
    /* sin el dato de hace un año: la devaluación histórica no se muestra */
  }
  return {
    valor: Number(filas[0].valor),
    fecha,
    anterior: filas[1] ? Number(filas[1].valor) : undefined,
    hace12m,
  };
}
