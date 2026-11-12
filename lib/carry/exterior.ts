/* Fondeo en el exterior (USD) frente al fondeo local en pesos. Funciones puras.
   - Tasa USD = SOFR + spread (ambas a un día, base 360) → E.A.
   - Sin cobertura: el costo en pesos depende de la devaluación: (1 + tUSD)(1 + dev) − 1.
   - Cubierto con forward: la devaluación la fija el forward. Con puntos forward ingresados:
     F = spot + puntos y dev = (F/spot)^(365/plazo) − 1. Sin puntos, paridad cubierta de tasas:
     dev = (1 + tCOP)/(1 + tUSD) − 1, y el costo cubierto queda igual a la tasa en pesos.
   - Devaluación de equilibrio = (1 + tCOP)/(1 + tUSD) − 1: si el peso se devalúa más que eso,
     fondearse en dólares sin cubrir sale más caro que en pesos. */
import { anualizar, eaDesdeOvernight360, tasaDiaria } from "./tasas";

export interface ParametrosExterior {
  /** SOFR en fracción (0,0389). */
  sofr: number;
  /** Spread sobre SOFR, en fracción (0,015 = 150 pb). */
  spread: number;
  /** Tasa en pesos con la que se compara (E.A.). */
  tasaCOP: number;
  /** Devaluación esperada del peso, E.A. (para el costo sin cobertura). */
  devEsperada: number;
  /** TRM spot (COP por USD). */
  spot: number;
  /** Puntos forward en pesos para el plazo (opcional). */
  puntosForward?: number | null;
  /** Plazo del forward en días. */
  plazoDias: number;
}

export type AlternativaFondeo = "local" | "sinCubrir" | "cubierto";

export const NOMBRE_ALTERNATIVA: Record<AlternativaFondeo, string> = {
  local: "Local en pesos",
  sinCubrir: "Exterior sin cubrir",
  cubierto: "Exterior cubierto (forward)",
};

export interface FilaComparacion {
  alternativa: AlternativaFondeo;
  /** Costo efectivo anual en pesos. */
  tasaEA: number;
  costoDia: number;
  costoAnual: number;
}

export interface ComparacionExterior {
  tasaUSD: number;
  devForward: number;
  /** "puntos" si salió de los puntos forward ingresados; "paridad" si de la paridad cubierta. */
  origenForward: "puntos" | "paridad";
  forward: number;
  devEquilibrio: number;
  filas: FilaComparacion[];
  masBarata: AlternativaFondeo;
}

export function tasaUSD(sofr: number, spread: number): number {
  return eaDesdeOvernight360(sofr + spread);
}

export const devEquilibrio = (tasaCOP: number, tUSD: number) => (1 + tasaCOP) / (1 + tUSD) - 1;

/** Costo en pesos de fondearse en dólares con una devaluación dada (E.A.). */
export const costoEnPesos = (tUSD: number, dev: number) => (1 + tUSD) * (1 + dev) - 1;

export function compararExterior(montoFondeado: number, x: ParametrosExterior): ComparacionExterior {
  const tUSD = tasaUSD(x.sofr, x.spread);
  const conPuntos = x.puntosForward != null && Number.isFinite(x.puntosForward) && x.spot > 0 && x.plazoDias > 0;
  const devForward = conPuntos ? anualizar((x.spot + (x.puntosForward as number)) / x.spot - 1, x.plazoDias) : devEquilibrio(x.tasaCOP, tUSD);
  const forward = conPuntos ? x.spot + (x.puntosForward as number) : x.spot * Math.pow(1 + devForward, x.plazoDias / 365);
  const tasas: Record<AlternativaFondeo, number> = {
    local: x.tasaCOP,
    sinCubrir: costoEnPesos(tUSD, x.devEsperada),
    cubierto: costoEnPesos(tUSD, devForward),
  };
  const filas = (Object.keys(tasas) as AlternativaFondeo[]).map((a) => ({
    alternativa: a,
    tasaEA: tasas[a],
    costoDia: montoFondeado * tasaDiaria(tasas[a]),
    costoAnual: montoFondeado * tasas[a],
  }));
  const masBarata = filas.reduce((m, f) => (f.tasaEA < m.tasaEA - 1e-9 ? f : m)).alternativa;
  return { tasaUSD: tUSD, devForward, origenForward: conPuntos ? "puntos" : "paridad", forward, devEquilibrio: devEquilibrio(x.tasaCOP, tUSD), filas, masBarata };
}
