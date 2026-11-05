/* datos.gov.co (API Socrata) — Tasa de Cambio Representativa del Mercado (dataset 32sa-8pi3).
   Solo se usa desde el servidor. */

export interface TRM {
  valor: number;
  /** Fecha de vigencia ISO */
  fecha: string;
  anterior?: number;
}

export async function trmDatosGov(): Promise<TRM> {
  const r = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=2", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`datos.gov.co TRM: HTTP ${r.status}`);
  const filas = (await r.json()) as { valor: string; vigenciadesde: string }[];
  if (!filas.length) throw new Error("datos.gov.co TRM: sin datos");
  return {
    valor: Number(filas[0].valor),
    fecha: filas[0].vigenciadesde.slice(0, 10),
    anterior: filas[1] ? Number(filas[1].valor) : undefined,
  };
}
