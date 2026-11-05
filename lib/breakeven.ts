/* Inflación implícita (breakeven) entre la curva TES tasa fija (nominal) y la curva TES UVR (real),
   ambas cero cupón por bootstrapping de bonos par (hoja Curva_Rendimiento):
     breakeven(t) = (1 + spot nominal(t)) / (1 + spot real(t)) − 1          (relación de Fisher)
     breakeven forward 1 año en t = (1 + BE(t))^t / (1 + BE(t−1))^(t−1) − 1
   Incluye la prima por riesgo inflacionario y por liquidez, así que no es solo la expectativa. */
import { spotEn, toN, type DatosMercado } from "@/lib/engine";

export const PLAZOS_BE = [1, 2, 3, 4, 5, 7, 10, 15, 20];

export interface PuntoBE {
  t: number;
  nominal: number;
  real: number;
  breakeven: number;
  /** Breakeven forward de 1 año que empieza en t − 1 (null en t ≤ 1). */
  forward: number | null;
}

export function curvaBreakeven(datos: Pick<DatosMercado, "zero" | "curvaUVR" | "curveDate">) {
  const u = datos.curvaUVR;
  if (!u || u.zero.length < 2) return null;
  // Solo plazos que cubren ambas curvas (sin extrapolar más allá de la referencia UVR más larga)
  const tMax = Math.min(datos.zero[datos.zero.length - 1][0], Math.max(...u.tes.map((r) => r[4])));
  const tMin = Math.max(datos.zero[0][0], Math.min(...u.tes.map((r) => r[4])) / 2, 0.25);
  const be = (t: number) => (1 + spotEn(datos.zero, t)) / (1 + spotEn(u.zero, t)) - 1;
  const puntos: PuntoBE[] = [];
  for (let t = Math.max(0.5, Math.ceil(tMin * 2) / 2); t <= tMax + 1e-9; t += 0.5) {
    const b = be(t);
    puntos.push({
      t,
      nominal: spotEn(datos.zero, t),
      real: spotEn(u.zero, t),
      breakeven: b,
      forward: t >= 1.5 && Number.isInteger(t) ? Math.pow(1 + b, t) / Math.pow(1 + be(t - 1), t - 1) - 1 : null,
    });
  }
  const desfaseDias = Math.abs(toN(u.fecha) - toN(datos.curveDate));
  return { puntos, tMax, fechaReal: u.fecha, fechaNominal: datos.curveDate, desfaseDias, be };
}

export type CurvaBreakeven = NonNullable<ReturnType<typeof curvaBreakeven>>;
