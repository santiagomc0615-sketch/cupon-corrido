/* Fondeo y carry neto de una posición. Funciones puras.
   - Monto fondeado = giro × (1 − haircut); el resto es capital propio.
   - Costo diario = monto fondeado × ((1 + tasa E.A.)^(1/365) − 1).
   - Carry a h días = giro × ((1+TIR)^(h/365) − 1) − fondeado × ((1+tasa)^(h/365) − 1).
   - ROE = carry / capital propio; colchón (pb) = carry del horizonte / DV01: cuántos pb puede
     subir la tasa del título antes de que la pérdida por precio se coma el carry. */
import { causacionDiaria, type PosicionCarry } from "./posicion";
import { CAPITALIZACIONES, eaDesdeNominal, tasaDiaria, tasaPeriodo, type Capitalizacion } from "./tasas";

export type TipoFondeo = "propio" | "repo" | "ibr" | "credito" | "exterior";

export const NOMBRE_FONDEO: Record<TipoFondeo, string> = {
  propio: "Capital propio",
  repo: "Simultánea / repo",
  ibr: "Interbancario (IBR)",
  credito: "Crédito",
  exterior: "Exterior en USD",
};

export interface FondeoLocal {
  tipo: TipoFondeo;
  /** Tasa en fracción (0,1225). */
  tasa: number;
  /** "EA" efectiva anual o "NA" nominal anual con su capitalización. */
  modalidad: "EA" | "NA";
  capitalizacion: Capitalizacion;
  /** Fracción no fondeada (0,10 = 10 %). */
  haircut: number;
}

/** Tasa del fondeo en E.A. (convierte si viene nominal). Capital propio: 0. */
export function tasaFondeoEA(f: Pick<FondeoLocal, "tipo" | "tasa" | "modalidad" | "capitalizacion">): number {
  if (f.tipo === "propio") return 0;
  return f.modalidad === "NA" ? eaDesdeNominal(f.tasa, CAPITALIZACIONES[f.capitalizacion]) : f.tasa;
}

/** Monto fondeado y capital propio. Con capital propio no hay fondeo. */
export function montos(giro: number, f: Pick<FondeoLocal, "tipo" | "haircut">) {
  const fondeado = f.tipo === "propio" ? 0 : giro * (1 - Math.min(1, Math.max(0, f.haircut)));
  return { fondeado, capital: giro - fondeado };
}

export interface CarryHorizonte {
  dias: number;
  causacion: number;
  costo: number;
  carry: number;
  /** carry / capital propio, en el horizonte (no anualizado). */
  roe: number;
  /** ROE llevado a E.A. */
  roeEA: number;
  /** carry / DV01, en pb. */
  colchonPb: number;
}

export interface ResultadoCarry {
  tasaEA: number;
  fondeado: number;
  capital: number;
  /** % del giro que se fondea. */
  pctFondeado: number;
  causacionDia: { cop: number; pct: number };
  costoDia: { cop: number; pct: number };
  carryDia: number;
  horizontes: CarryHorizonte[];
}

export const HORIZONTES = [30, 90, 365] as const;

/**
 * @param tasaEA Tasa del fondeo ya en E.A. (para el exterior, el costo en pesos que se elija).
 */
export function calcularCarry(
  p: Pick<PosicionCarry, "giro" | "tir" | "dv01">,
  f: Pick<FondeoLocal, "tipo" | "haircut">,
  tasaEA: number,
  horizontes: readonly number[] = HORIZONTES,
): ResultadoCarry {
  const { fondeado, capital } = montos(p.giro, f);
  const caus = causacionDiaria(p);
  const costoPct = tasaDiaria(tasaEA);
  const costoDia = fondeado * costoPct;
  return {
    tasaEA,
    fondeado,
    capital,
    pctFondeado: p.giro ? fondeado / p.giro : 0,
    causacionDia: caus,
    costoDia: { cop: costoDia, pct: costoPct },
    carryDia: caus.cop - costoDia,
    horizontes: horizontes.map((dias) => {
      const causacion = p.giro * tasaPeriodo(p.tir, dias);
      const costo = fondeado * tasaPeriodo(tasaEA, dias);
      const carry = causacion - costo;
      const roe = capital ? carry / capital : 0;
      return {
        dias,
        causacion,
        costo,
        carry,
        roe,
        roeEA: capital && 1 + roe > 0 ? Math.pow(1 + roe, 365 / dias) - 1 : 0,
        colchonPb: p.dv01 ? carry / p.dv01 : 0,
      };
    }),
  };
}
