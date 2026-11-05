/* Punto único de entrada de los datos de mercado para la interfaz.
   Fase 2: usa el respaldo data/datos-mercado.json (última carga del Excel).
   Fase 3: consultará BanRep / datos.gov.co desde el servidor y caerá a este respaldo si fallan. */
import respaldo from "@/data/datos-mercado.json";
import type { DatosMercado } from "@/lib/engine";
import { MACRO, type Macro } from "./macro";

export interface SnapshotMercado {
  datos: DatosMercado;
  macro: Macro;
  /** Fecha de análisis por defecto (valoración de la calculadora y del portafolio). */
  fechaAnalisis: string;
  /** De dónde salieron los datos. */
  origen: "respaldo" | "en-vivo";
}

/** Fecha de corte de la carga del Excel usada por el prototipo. */
export const FECHA_ANALISIS = "2026-11-04";

export async function obtenerMercado(): Promise<SnapshotMercado> {
  return {
    datos: respaldo as unknown as DatosMercado,
    macro: MACRO,
    fechaAnalisis: FECHA_ANALISIS,
    origen: "respaldo",
  };
}
