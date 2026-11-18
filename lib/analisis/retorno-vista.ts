/* Presentación del retorno esperado (sin cálculos financieros nuevos): pasos de la cascada a partir de
   las cifras de lib/analisis/retorno-esperado.ts, porcentajes sobre la posición y sobre el capital
   propio, y los días de la curva de ganancia acumulada. Funciones puras. */

export interface FilaRetorno {
  dias: number;
  cupones: number;
  causacion: number;
  roll: number | null;
  costoFondeo: number;
  total: number;
}

export type ClavePaso = "causacion" | "roll" | "costo" | "total";

export interface PasoCascada {
  clave: ClavePaso;
  etiqueta: string;
  /** Aporte del paso (con signo). */
  valor: number;
  /** Nivel acumulado antes y después del paso. El total va de 0 a su valor. */
  desde: number;
  hasta: number;
}

/** Causación → roll-down (si aplica) → costo de fondeo (si está activo) → total. El último nivel
    acumulado es exactamente el total (mismas operaciones y en el mismo orden que el cálculo). */
export function pasosCascada(f: FilaRetorno, fondeoActivo: boolean): PasoCascada[] {
  const pasos: PasoCascada[] = [];
  let nivel = 0;
  pasos.push({ clave: "causacion", etiqueta: "Causación", valor: f.causacion, desde: nivel, hasta: (nivel = f.causacion) });
  const roll = f.roll ?? 0;
  if (f.roll != null) pasos.push({ clave: "roll", etiqueta: "Roll-down", valor: roll, desde: nivel, hasta: (nivel = nivel + roll) });
  else nivel = nivel + roll;
  if (fondeoActivo) pasos.push({ clave: "costo", etiqueta: "Costo de fondeo", valor: -f.costoFondeo, desde: nivel, hasta: (nivel = nivel - f.costoFondeo) });
  else nivel = nivel - f.costoFondeo;
  pasos.push({ clave: "total", etiqueta: "Total", valor: nivel, desde: 0, hasta: nivel });
  return pasos;
}

/** Rentabilidad E.A. de un retorno del periodo; null si se pierde todo el capital o más. */
export const anualizarPct = (pct: number, dias: number): number | null => (dias > 0 && 1 + pct > 0 ? Math.pow(1 + pct, 365 / dias) - 1 : null);

export interface Porcentajes {
  /** % sobre el valor de la posición (giro de hoy). */
  posicion: number;
  /** % sobre el capital propio (giro × haircut con fondeo; el giro sin fondeo). */
  capitalPropio: number;
  anualPosicion: number | null;
  anualCapitalPropio: number | null;
}

export function porcentajes(total: number, valorHoy: number, capitalPropio: number, dias: number): Porcentajes {
  const posicion = valorHoy ? total / valorHoy : 0;
  const cp = capitalPropio ? total / capitalPropio : 0;
  return { posicion, capitalPropio: cp, anualPosicion: anualizarPct(posicion, dias), anualCapitalPropio: anualizarPct(cp, dias) };
}

/** Días de la curva de ganancia acumulada: cada `paso` días de 0 a 365, más 30, 90 y 180 exactos. */
export function diasCurva(paso = 5, fin = 365): number[] {
  const s = new Set<number>([30, 90, 180, fin]);
  for (let d = 0; d <= fin; d += paso) s.add(d);
  return [...s].filter((d) => d <= fin).sort((a, b) => a - b);
}
