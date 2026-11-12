/* Configuración del fondeo que elige el usuario (se guarda en el navegador) y su tasa efectiva.
   La comparten la calculadora y el portafolio. Funciones puras.
   Todo dato de mercado es automático por defecto y se toma del día (MercadoFondeo, que se refresca
   dos veces al día): TPM e IBR del BanRep, SOFR de la Fed de Nueva York y TRM de datos.gov.co.
   Un campo en null significa «usar el dato en vivo»; con un número, manda el valor ingresado. */
import { compararExterior, type ComparacionExterior } from "./exterior";
import { calcularCarry, tasaFondeoEA, type FondeoLocal, type ResultadoCarry } from "./fondeo";
import type { PosicionCarry } from "./posicion";
import { eaDesdeOvernight360 } from "./tasas";

export interface ConfigExterior {
  /** SOFR ingresada a mano; null = dato en vivo de la Fed de Nueva York. */
  sofr: number | null;
  spread: number;
  /** Devaluación esperada (E.A.); null = la implícita del mercado (paridad cubierta). */
  devEsperada: number | null;
  puntosForward: number | null;
  plazoDias: number;
  cobertura: "cubierto" | "sinCubrir";
  /** Tasa en pesos de referencia; null = IBR del plazo del forward (BanRep, en vivo). */
  tasaCOP: number | null;
}

export interface ConfigFondeo extends Omit<FondeoLocal, "tasa"> {
  /** Tasa ingresada a mano; null = automática (simultánea: TPM; interbancario: IBR overnight + spread). */
  tasa: number | null;
  /** Spread sobre el IBR overnight en el fondeo interbancario (fracción, N.A.). */
  spreadIbr: number;
  exterior: ConfigExterior;
}

export const CONFIG_INICIAL: ConfigFondeo = {
  tipo: "repo",
  tasa: null,
  spreadIbr: 0,
  modalidad: "EA",
  capitalizacion: "diaria",
  haircut: 0.1,
  exterior: { sofr: null, spread: 0.015, devEsperada: null, puntosForward: null, plazoDias: 90, cobertura: "cubierto", tasaCOP: null },
};

/** IBR publicado (fracción, nominal anual base 360) por plazo. */
export interface IBRPlazos {
  fecha: string;
  on: number;
  m1: number;
  m3: number;
  m6: number;
}

export interface MercadoFondeo {
  /** SOFR en vivo (fracción) o null si no hay dato. */
  sofr: number | null;
  sofrFecha?: string;
  /** TRM spot. */
  spot: number | null;
  spotFecha?: string;
  /** TRM de hace un año, para la devaluación de los últimos 12 meses. */
  spot12m?: { valor: number; fecha: string } | null;
  /** Tasa de política monetaria (E.A.). */
  tpm?: number | null;
  tpmFecha?: string;
  ibr?: IBRPlazos | null;
}

/** IBR de un plazo llevado a E.A.: (1 + r·d/360)^(365/d) − 1 (overnight: base 360 diaria). */
export function ibrEA(r: number, dias: number): number {
  return dias <= 1 ? eaDesdeOvernight360(r) : Math.pow(1 + (r * dias) / 360, 365 / dias) - 1;
}

/** IBR (E.A.) del plazo más cercano al del forward: overnight, 1, 3 o 6 meses. */
export function ibrParaPlazo(ibr: IBRPlazos, dias: number): { ea: number; plazo: string } {
  const opciones: [string, number, number][] = [
    ["overnight", 1, ibr.on],
    ["1 mes", 30, ibr.m1],
    ["3 meses", 90, ibr.m3],
    ["6 meses", 180, ibr.m6],
  ];
  const [plazo, d, r] = opciones.reduce((m, o) => (Math.abs(o[1] - dias) < Math.abs(m[1] - dias) ? o : m));
  return { ea: ibrEA(r, d), plazo };
}

/** Tasa E.A. del fondeo local elegido (null si falta el dato o no aplica). */
export function tasaLocalEA(c: ConfigFondeo, m: MercadoFondeo): number | null {
  if (c.tipo === "propio") return 0;
  if (c.tipo === "exterior") return null;
  if (c.tasa != null) return tasaFondeoEA({ ...c, tasa: c.tasa });
  if (c.tipo === "repo") return m.tpm ?? null;
  if (c.tipo === "ibr") return m.ibr ? eaDesdeOvernight360(m.ibr.on + c.spreadIbr) : null;
  return null; // crédito: no hay dato público; se ingresa a mano
}

/** Tasa en pesos de mercado para el plazo del forward. */
export function tasaCOPMercado(c: ConfigFondeo, m: MercadoFondeo): number | null {
  return m.ibr ? ibrParaPlazo(m.ibr, c.exterior.plazoDias).ea : (m.tpm ?? null);
}

/** Tasa en pesos con la que se compara el exterior: la del fondeo local elegido, o la de referencia. */
export function tasaCOPReferencia(c: ConfigFondeo, m: MercadoFondeo): number | null {
  const local = c.tipo === "exterior" || c.tipo === "propio" ? null : tasaLocalEA(c, m);
  return local ?? c.exterior.tasaCOP ?? tasaCOPMercado(c, m);
}

export function comparacion(c: ConfigFondeo, m: MercadoFondeo, montoFondeado: number): ComparacionExterior | null {
  const sofr = c.exterior.sofr ?? m.sofr;
  const cop = tasaCOPReferencia(c, m),
    copMercado = tasaCOPMercado(c, m);
  if (sofr == null || !m.spot || cop == null || copMercado == null) return null;
  return compararExterior(montoFondeado, {
    sofr,
    spread: c.exterior.spread,
    tasaCOP: cop,
    tasaCOPMercado: copMercado,
    devEsperada: c.exterior.devEsperada,
    spot: m.spot,
    puntosForward: c.exterior.puntosForward,
    plazoDias: c.exterior.plazoDias,
  });
}

/** Devaluación de los últimos 12 meses según la TRM (referencia, no se usa por defecto). */
export function devUltimos12m(m: MercadoFondeo): number | null {
  return m.spot && m.spot12m?.valor ? m.spot / m.spot12m.valor - 1 : null;
}

/** Tasa E.A. en pesos del fondeo elegido. En el exterior, la del costo cubierto o sin cubrir. */
export function tasaEfectiva(c: ConfigFondeo, m: MercadoFondeo): number | null {
  if (c.tipo !== "exterior") return tasaLocalEA(c, m);
  const cmp = comparacion(c, m, 0);
  return cmp ? (cmp.filas.find((f) => f.alternativa === c.exterior.cobertura)?.tasaEA ?? null) : null;
}

/** Carry de una posición con la configuración del usuario (null si falta algún dato). */
export function carryConConfig(p: Pick<PosicionCarry, "giro" | "tir" | "dv01">, c: ConfigFondeo, m: MercadoFondeo): ResultadoCarry | null {
  const t = tasaEfectiva(c, m);
  return t == null ? null : calcularCarry(p, c, t);
}

/** Por qué no se puede calcular (para el mensaje en pantalla). */
export function faltante(c: ConfigFondeo, m: MercadoFondeo): string {
  if (c.tipo === "credito" && c.tasa == null) return "Ingrese la tasa del crédito: no hay un dato público para ella.";
  if (c.tipo === "repo" && c.tasa == null && m.tpm == null) return "Falta la TPM del BanRep: ingrese la tasa a mano.";
  if (c.tipo === "ibr" && c.tasa == null && !m.ibr) return "Falta el IBR del BanRep: ingrese la tasa a mano.";
  if (c.tipo === "exterior") {
    if ((c.exterior.sofr ?? m.sofr) == null) return "Falta la SOFR: no llegó el dato en vivo. Ingrésela en «Fondeo en el exterior».";
    if (!m.spot) return "Falta la TRM del día.";
  }
  return "Faltan datos para calcular el fondeo.";
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
