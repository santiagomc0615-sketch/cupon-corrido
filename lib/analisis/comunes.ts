/* Piezas comunes del análisis del título. No toca lib/engine: arma variantes del bono y le pide
   el precio al motor. */
import type { Bono } from "@/lib/engine";

/** Tasa de negociación que mueve el precio, según el tipo: TIR (tasa fija), TIR real (UVR) o
    spread de compra sobre el índice (IPC e IBR). En fracción. */
export function tasaDe(b: Bono): number {
  return b.tipo === "TF" || b.tipo === "UVR" ? b.tasaCompra : b.spreadCompra;
}

/** Nombre de esa tasa para la interfaz. */
export function nombreTasa(b: Bono): string {
  if (b.tipo === "TF") return "TIR E.A.";
  if (b.tipo === "UVR") return "TIR real";
  return b.tipo === "IPC" ? "Spread sobre IPC" : "Spread sobre IBR";
}

/** El mismo bono con otra tasa de negociación (y, si se da, otra fecha de valoración).
    En IBR se quita el precio dado para que la tasa mande. */
export function conTasa(b: Bono, tasa: number, valoracion?: string): Bono {
  const v = valoracion ?? b.valoracion;
  if (b.tipo === "TF" || b.tipo === "UVR") return { ...b, tasaCompra: tasa, valoracion: v };
  if (b.tipo === "IPC") return { ...b, spreadCompra: tasa, valoracion: v };
  return { ...b, spreadCompra: tasa, precioDado: 0, valoracion: v };
}

/** Tasa de venta (bid) del bono, en la misma unidad que tasaDe. */
export function tasaVentaDe(b: Bono): number {
  return b.tipo === "TF" || b.tipo === "UVR" ? b.tasaVenta : b.spreadVenta;
}
