/* Reserva Federal de Nueva York — SOFR (tasa a un día garantizada en USD), API pública oficial:
   https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json
   Solo se usa desde el servidor. */

export interface SOFR {
  /** Fracción (0,0389). Tasa a un día, base 360. */
  valor: number;
  /** Fecha efectiva (AAAA-MM-DD). */
  fecha: string;
}

export function leerSOFR(json: unknown): SOFR {
  const r = (json as { refRates?: { effectiveDate?: string; percentRate?: number; type?: string }[] })?.refRates?.[0];
  if (!r || r.type !== "SOFR" || typeof r.percentRate !== "number" || !r.effectiveDate) throw new Error("NY Fed SOFR: respuesta sin dato.");
  return { valor: r.percentRate / 100, fecha: r.effectiveDate };
}

export async function sofrNYFed(): Promise<SOFR> {
  const r = await fetch("https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`NY Fed SOFR: HTTP ${r.status}`);
  return leerSOFR(await r.json());
}
