/* Conjunto de mercado de prueba: el respaldo del Excel con datos de fondeo y CDT fijos. */
import datos from "@/data/datos-mercado.json";
import type { SnapshotMercado } from "@/lib/data/mercado";
import { MACRO } from "@/lib/data/macro";
import type { DatosMercado } from "@/lib/engine";

export const SNAP_PRUEBA = {
  datos: datos as unknown as DatosMercado,
  macro: { ...MACRO },
  fechaAnalisis: "2026-11-04",
  origen: "respaldo",
  fuentes: {},
  trm: { valor: 3900, fecha: "2026-11-04", hace12m: { valor: 4200, fecha: "2025-11-04" } },
  sofr: { valor: 0.039, fecha: "2026-11-03" },
  dtf: { valor: 0.095, fecha: "2026-11-03" },
  ust10: { valor: 0.042, fecha: "2026-11-03" },
  ust10Curva: { valor: 0.042, fecha: "2026-11-03" },
  cargas: {},
  actualizado: "2026-11-04 08:00",
} as unknown as SnapshotMercado;
