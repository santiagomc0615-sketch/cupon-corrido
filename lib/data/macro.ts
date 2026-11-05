/* Datos macro que no vienen en ninguna API oficial o que se fijan a mano.
   La tasa de política se reemplaza por el dato diario de BanRep SDMX cuando está disponible. */

export interface Macro {
  /** Tasa de política monetaria (fracción). */
  tpm: number;
  /** Fecha del dato de la tasa de política. */
  tpmFecha: string;
  tpmFuente: string;
  /** Última decisión de la junta directiva (fecha y texto corto), registrada a mano. */
  decisionFecha: string;
  decision: string;
  decisionFuente: string;
  /** Inflación núcleo (sin alimentos ni regulados). */
  nucleo: number;
  nucleoFecha: string;
  /** Expectativa de inflación a 2 años. */
  exp2y: number;
}

/** Valores de respaldo (verificados en prensa, ver /noticias). */
export const MACRO: Macro = {
  tpm: 0.1225,
  tpmFecha: "2026-10-30",
  tpmFuente: "BanRep vía BBVA Research",
  decisionFecha: "2026-10-30",
  decision: "se mantiene",
  decisionFuente: "BBVA Research",
  nucleo: 0.06,
  nucleoFecha: "2026-09-30",
  exp2y: 0.04,
};
