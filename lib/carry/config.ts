/* Configuración del fondeo que elige el usuario (se guarda en el navegador) y su tasa efectiva.
   La comparten la calculadora y el portafolio. Funciones puras. */
import { compararExterior, type ComparacionExterior } from "./exterior";
import { calcularCarry, tasaFondeoEA, type FondeoLocal, type ResultadoCarry } from "./fondeo";
import type { PosicionCarry } from "./posicion";

export interface ConfigExterior {
  /** SOFR ingresada a mano; null = usar el dato en vivo de la Fed de Nueva York. */
  sofr: number | null;
  spread: number;
  devEsperada: number;
  puntosForward: number | null;
  plazoDias: number;
  cobertura: "cubierto" | "sinCubrir";
  /** Tasa en pesos con la que se compara cuando el fondeo elegido no es local. */
  tasaCOP: number;
}

export interface ConfigFondeo extends FondeoLocal {
  exterior: ConfigExterior;
}

export const CONFIG_INICIAL: ConfigFondeo = {
  tipo: "repo",
  tasa: 0.1225,
  modalidad: "EA",
  capitalizacion: "diaria",
  haircut: 0.1,
  exterior: { sofr: null, spread: 0.015, devEsperada: 0.03, puntosForward: null, plazoDias: 90, cobertura: "cubierto", tasaCOP: 0.1225 },
};

export interface MercadoFondeo {
  /** SOFR en vivo (fracción) o null si no hay dato. */
  sofr: number | null;
  /** TRM spot. */
  spot: number | null;
}

/** Tasa en pesos que se compara con el exterior: la del fondeo local elegido, o la de referencia. */
export function tasaCOPReferencia(c: ConfigFondeo): number {
  return c.tipo === "exterior" || c.tipo === "propio" ? c.exterior.tasaCOP : tasaFondeoEA(c);
}

export function comparacion(c: ConfigFondeo, m: MercadoFondeo, montoFondeado: number): ComparacionExterior | null {
  const sofr = c.exterior.sofr ?? m.sofr;
  if (sofr == null || !m.spot) return null;
  return compararExterior(montoFondeado, {
    sofr,
    spread: c.exterior.spread,
    tasaCOP: tasaCOPReferencia(c),
    devEsperada: c.exterior.devEsperada,
    spot: m.spot,
    puntosForward: c.exterior.puntosForward,
    plazoDias: c.exterior.plazoDias,
  });
}

/** Tasa E.A. en pesos del fondeo elegido. En el exterior, la del costo cubierto o sin cubrir. */
export function tasaEfectiva(c: ConfigFondeo, m: MercadoFondeo): number | null {
  if (c.tipo !== "exterior") return tasaFondeoEA(c);
  const cmp = comparacion(c, m, 0);
  return cmp ? (cmp.filas.find((f) => f.alternativa === c.exterior.cobertura)?.tasaEA ?? null) : null;
}

/** Carry de una posición con la configuración del usuario (null si falta el dato de SOFR o TRM). */
export function carryConConfig(p: Pick<PosicionCarry, "giro" | "tir" | "dv01">, c: ConfigFondeo, m: MercadoFondeo): ResultadoCarry | null {
  const t = tasaEfectiva(c, m);
  return t == null ? null : calcularCarry(p, c, t);
}

/** Totales del portafolio con el mismo fondeo para todas las posiciones. */
export function carryPortafolioFondeo(posiciones: Pick<PosicionCarry, "giro" | "tir" | "dv01">[], c: ConfigFondeo, m: MercadoFondeo) {
  const rs = posiciones.map((p) => carryConConfig(p, c, m));
  if (!rs.length || rs.some((r) => r == null)) return null;
  const R = rs as ResultadoCarry[];
  const suma = (f: (r: ResultadoCarry) => number) => R.reduce((s, r) => s + f(r), 0);
  const giro = posiciones.reduce((s, p) => s + p.giro, 0);
  const dv01 = posiciones.reduce((s, p) => s + p.dv01, 0);
  const fondeado = suma((r) => r.fondeado),
    capital = suma((r) => r.capital);
  const horizontes = R[0].horizontes.map((h, i) => {
    const carry = suma((r) => r.horizontes[i].carry);
    const roe = capital ? carry / capital : 0;
    return {
      dias: h.dias,
      causacion: suma((r) => r.horizontes[i].causacion),
      costo: suma((r) => r.horizontes[i].costo),
      carry,
      roe,
      roeEA: capital && 1 + roe > 0 ? Math.pow(1 + roe, 365 / h.dias) - 1 : 0,
      colchonPb: dv01 ? carry / dv01 : 0,
    };
  });
  return {
    tasaEA: R[0].tasaEA,
    giro,
    fondeado,
    capital,
    pctFondeado: giro ? fondeado / giro : 0,
    causacionDia: suma((r) => r.causacionDia.cop),
    costoDia: suma((r) => r.costoDia.cop),
    carryDia: suma((r) => r.carryDia),
    horizontes,
  };
}
