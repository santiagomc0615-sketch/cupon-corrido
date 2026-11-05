/* Datos macro que no vienen en las series del Excel. Verificados en prensa (ver /noticias).
   En la Fase 3 se reemplazan por datos en vivo de BanRep y DANE. */

export interface Macro {
  /** Tasa de política monetaria (fracción). */
  tpm: number;
  tpmFecha: string;
  tpmFuente: string;
  /** Texto corto de la última decisión de la junta. */
  tpmDecision: string;
  ipcSep: number;
  ipcFecha: string;
  ipcFuente: string;
  /** Inflación núcleo (sin alimentos ni regulados). */
  nucleo: number;
  /** Expectativa de inflación a 2 años. */
  exp2y: number;
}

export const MACRO: Macro = {
  tpm: 0.1225,
  tpmFecha: "2026-10-30",
  tpmFuente: "BanRep vía BBVA Research",
  tpmDecision: "se mantiene",
  ipcSep: 0.0629,
  ipcFecha: "2026-09-30",
  ipcFuente: "DANE vía Noticias RCN",
  nucleo: 0.06,
  exp2y: 0.04,
};
