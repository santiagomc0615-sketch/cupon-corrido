/* Fondeo en el exterior (USD) frente al fondeo local en pesos. Funciones puras.
   - Tasa USD de quien se fondea = SOFR + spread (a un día, base 360) → E.A.
   - Forward del mercado: con puntos forward ingresados, F = spot + puntos. Sin puntos, paridad
     cubierta con tasas de mercado: F/spot = ((1 + IBR del plazo)/(1 + SOFR))^(plazo/365).
     Devaluación implícita (E.A.) = (F/spot)^(365/plazo) − 1.
   - Cubierto: (1 + tasa USD)(1 + devaluación implícita) − 1.
   - Sin cubrir: (1 + tasa USD)(1 + devaluación esperada) − 1. Si no hay una expectativa propia, se
     usa la implícita del mercado (es lo que el mercado descuenta hoy).
   - Devaluación de equilibrio = (1 + tasa COP)/(1 + tasa USD) − 1: si el peso se devalúa más que
     eso, fondearse en dólares sin cubrir sale más caro que en pesos. */
import { anualizar, eaDesdeOvernight360, tasaDiaria } from "./tasas";

export interface ParametrosExterior {
  /** SOFR en fracción (0,0389), a un día base 360. */
  sofr: number;
  /** Spread sobre SOFR que paga quien se fondea, en fracción (0,015 = 150 pb). */
  spread: number;
  /** Tasa en pesos con la que se compara el exterior (E.A.). */
  tasaCOP: number;
  /** Tasa en pesos de mercado para el plazo del forward (E.A.), para la paridad cubierta. */
  tasaCOPMercado: number;
  /** Devaluación esperada del peso, E.A.; null = la implícita del mercado. */
  devEsperada: number | null;
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
  /** SOFR llevada a E.A. (sin spread). */
  sofrEA: number;
  devForward: number;
  devEsperada: number;
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

/** Devaluación implícita por paridad cubierta con tasas de mercado (E.A.). */
export const devParidad = (tasaCOPMercado: number, sofrEA: number) => (1 + tasaCOPMercado) / (1 + sofrEA) - 1;

export function compararExterior(montoFondeado: number, x: ParametrosExterior): ComparacionExterior {
  const tUSD = tasaUSD(x.sofr, x.spread);
  const sofrEA = eaDesdeOvernight360(x.sofr);
  const conPuntos = x.puntosForward != null && Number.isFinite(x.puntosForward) && x.spot > 0 && x.plazoDias > 0;
  const devForward = conPuntos
    ? anualizar((x.spot + (x.puntosForward as number)) / x.spot - 1, x.plazoDias)
    : devParidad(x.tasaCOPMercado, sofrEA);
  const forward = conPuntos ? x.spot + (x.puntosForward as number) : x.spot * Math.pow(1 + devForward, x.plazoDias / 365);
  const devEsp = x.devEsperada ?? devForward;
  const tasas: Record<AlternativaFondeo, number> = {
    local: x.tasaCOP,
    sinCubrir: costoEnPesos(tUSD, devEsp),
    cubierto: costoEnPesos(tUSD, devForward),
  };
  const filas = (Object.keys(tasas) as AlternativaFondeo[]).map((a) => ({
    alternativa: a,
    tasaEA: tasas[a],
    costoDia: montoFondeado * tasaDiaria(tasas[a]),
    costoAnual: montoFondeado * tasas[a],
  }));
  // En empate gana la de menos riesgo: local, luego cubierto, luego sin cubrir.
  const preferencia: AlternativaFondeo[] = ["local", "cubierto", "sinCubrir"];
  const masBarata = preferencia.reduce((m, a) => (tasas[a] < tasas[m] - 1e-9 ? a : m));
  return {
    tasaUSD: tUSD,
    sofrEA,
    devForward,
    devEsperada: devEsp,
    origenForward: conPuntos ? "puntos" : "paridad",
    forward,
    devEquilibrio: devEquilibrio(x.tasaCOP, tUSD),
    filas,
    masBarata,
  };
}
