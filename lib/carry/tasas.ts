/* Conversiones de tasas para el carry y el fondeo. Funciones puras.
   Convención: las tasas se manejan en fracción efectiva anual (E.A.) y se llevan a días con
   capitalización compuesta sobre 365 días: (1 + tasa)^(días/365) − 1. */

/** Factor de un horizonte: (1 + ea)^(días/365) − 1. */
export const tasaPeriodo = (ea: number, dias: number) => Math.pow(1 + ea, dias / 365) - 1;

/** Tasa diaria equivalente: (1 + ea)^(1/365) − 1. */
export const tasaDiaria = (ea: number) => tasaPeriodo(ea, 1);

/** Nominal anual con `m` capitalizaciones al año → E.A.: (1 + na/m)^m − 1. */
export const eaDesdeNominal = (na: number, m: number) => Math.pow(1 + na / m, m) - 1;

/** Tasa a un día con base 360 (SOFR, IBR overnight) → E.A.: (1 + r/360)^365 − 1. */
export const eaDesdeOvernight360 = (r: number) => Math.pow(1 + r / 360, 365) - 1;

/** Anualiza una variación de un plazo en días: (1 + v)^(365/días) − 1. */
export const anualizar = (v: number, dias: number) => Math.pow(1 + v, 365 / dias) - 1;

/** Capitalizaciones por año de cada modalidad nominal. */
export const CAPITALIZACIONES = { diaria: 365, mensual: 12, trimestral: 4, semestral: 2 } as const;
export type Capitalizacion = keyof typeof CAPITALIZACIONES;
