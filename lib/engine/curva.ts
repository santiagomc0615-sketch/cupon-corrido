/* Curva cero cupón TES por bootstrapping de bonos par anuales (hoja Curva_Rendimiento).
   1. TIR par en cada nodo: interpolación lineal de la TIR de mercado por plazo, plana fuera de rango.
   2. Factor de descuento: t < 1 → (1+C)^(−t); t = 1 → 1/(1+C); t ≥ 2 → (1 − C·ΣD₁..D_{t−1})/(1+C).
   3. Spot: D^(−1/t) − 1. */
import { days, toN } from "./fechas";
import type { TuplaTES } from "./mercado";

/** Nodos de la curva: 0,25; 0,5; 0,75 y de 1 a 30 años. */
export const NODOS_CURVA = [0.25, 0.5, 0.75, ...Array.from({ length: 30 }, (_, i) => i + 1)];

/** Plazo en años de un TES a la fecha de la curva. La columna G del Excel resulta en días
    reales / 365 (no descuenta el 29 de febrero), así que se replica igual. */
export function plazoTES(fechaCurva: string, vencimiento: string): number {
  return days(toN(fechaCurva), toN(vencimiento), "Real/365") / 365;
}

/** TIR par interpolada en t (columna C). refs ordenadas por plazo: [plazo, TIR]. */
export function tirInterpolada(refs: [number, number][], t: number): number {
  const n = refs.length;
  if (t <= refs[0][0]) return refs[0][1];
  if (t >= refs[n - 1][0]) return refs[n - 1][1];
  let i = 0;
  for (let k = 0; k < n; k++) if (refs[k][0] <= t) i = k; // MATCH(t, G, 1)
  const [g0, f0] = refs[i],
    [g1, f1] = refs[i + 1];
  return f0 + ((f1 - f0) * (t - g0)) / (g1 - g0);
}

/** Curva cero cupón [plazo, spot E.A.] a partir de las referencias TES. */
export function curvaCero(tes: TuplaTES[]): [number, number][] {
  const refs = tes.map((r) => [r[4], r[3]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const enteros: number[] = []; // factores de descuento de los nodos 1, 2, …
  return NODOS_CURVA.map((t) => {
    const C = tirInterpolada(refs, t);
    let D: number;
    if (t < 1) D = Math.pow(1 + C, -t);
    else if (t === 1) D = 1 / (1 + C);
    else D = (1 - C * enteros.reduce((s, x) => s + x, 0)) / (1 + C);
    if (t >= 1) enteros.push(D);
    return [t, Math.pow(D, -1 / t) - 1];
  });
}
