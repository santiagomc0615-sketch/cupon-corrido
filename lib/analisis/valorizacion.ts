/* Potencial de valorización: si la tasa del título llega a un objetivo, ¿cuánto vale hoy y cuánto se
   gana? El precio objetivo lo calcula el motor con la tasa objetivo (misma fecha de valoración). */
import { esError, type Bono, type Motor, type ResultadoValoracion } from "@/lib/engine";
import { conTasa, tasaDe } from "./comunes";

export interface Valorizacion {
  tasaActual: number;
  tasaObjetivo: number;
  /** Cambio de tasa en pb (positivo = la tasa sube). */
  cambioPb: number;
  precioActual: number;
  precioObjetivo: number;
  giroActual: number;
  giroObjetivo: number;
  ganancia: number;
  gananciaPct: number;
}

export function potencialValorizacion(motor: Pick<Motor, "price">, b: Bono, o: ResultadoValoracion, tasaObjetivo: number): Valorizacion | { error: string } {
  const obj = motor.price(conTasa(b, tasaObjetivo));
  if (esError(obj)) return { error: obj.error };
  const ganancia = obj.giro - o.giro;
  return {
    tasaActual: tasaDe(b),
    tasaObjetivo,
    cambioPb: (tasaObjetivo - tasaDe(b)) * 1e4,
    precioActual: o.dirty,
    precioObjetivo: obj.dirty,
    giroActual: o.giro,
    giroObjetivo: obj.giro,
    ganancia,
    gananciaPct: o.giro ? ganancia / o.giro : 0,
  };
}
