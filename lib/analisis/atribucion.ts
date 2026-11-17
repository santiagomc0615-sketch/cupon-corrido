/* Atribución del resultado desde la compra. Tres valoraciones del motor:
     V0 = giro el día de la compra a la tasa de compra
     V1 = giro hoy a la tasa de compra       (lo que habría valido si la tasa no se movía)
     V2 = giro hoy a la tasa de mercado actual
   y los cupones pagados entre la compra y hoy (flujos en pesos del motor, cashCOP de V0):
     causación   = V1 + cupones − V0        (el rendimiento a la tasa de compra)
     valorización = V2 − V1                 (efecto del cambio de tasa)
     total       = V2 + cupones − V0 = causación + valorización
   Sin capital amortizado en el camino salvo el del vencimiento (si ya venció, se cuenta como cupón). */
import { esError, toN, toS, type Bono, type Motor } from "@/lib/engine";
import { conTasa } from "./comunes";

export interface Atribucion {
  fechaCompra: string;
  fechaHoy: string;
  dias: number;
  tasaCompra: number;
  tasaMercado: number;
  giroCompra: number;
  giroHoyTasaCompra: number;
  giroHoy: number;
  cupones: { fecha: string; cop: number }[];
  totalCupones: number;
  causacion: number;
  valorizacion: number;
  total: number;
  /** Rentabilidad total del periodo sobre lo invertido y en E.A. */
  rentabilidad: number;
  rentabilidadEA: number;
}

export function atribucionDesdeCompra(
  motor: Pick<Motor, "price">,
  b: Bono,
  p: { fechaCompra: string; tasaCompra: number; fechaHoy: string; tasaMercado: number },
): Atribucion | { error: string } {
  if (p.fechaCompra >= p.fechaHoy) return { error: "La fecha de compra debe ser anterior a la fecha de hoy." };
  if (p.fechaCompra < b.emision) return { error: "La fecha de compra es anterior a la emisión." };
  const v0 = motor.price(conTasa(b, p.tasaCompra, p.fechaCompra));
  if (esError(v0)) return { error: "Compra: " + v0.error };
  const v1 = motor.price(conTasa(b, p.tasaCompra, p.fechaHoy));
  if (esError(v1)) return { error: "Hoy: " + v1.error };
  const v2 = motor.price(conTasa(b, p.tasaMercado, p.fechaHoy));
  if (esError(v2)) return { error: "Hoy a mercado: " + v2.error };

  const nHoy = toN(p.fechaHoy);
  const cupones = v0.cashCOP.filter((c) => c.n <= nHoy).map((c) => ({ fecha: toS(c.n), cop: c.cop }));
  const totalCupones = cupones.reduce((s, c) => s + c.cop, 0);
  const causacion = v1.giro + totalCupones - v0.giro;
  const valorizacion = v2.giro - v1.giro;
  const total = causacion + valorizacion;
  const dias = nHoy - toN(p.fechaCompra);
  const rentabilidad = v0.giro ? total / v0.giro : 0;
  return {
    fechaCompra: p.fechaCompra,
    fechaHoy: p.fechaHoy,
    dias,
    tasaCompra: p.tasaCompra,
    tasaMercado: p.tasaMercado,
    giroCompra: v0.giro,
    giroHoyTasaCompra: v1.giro,
    giroHoy: v2.giro,
    cupones,
    totalCupones,
    causacion,
    valorizacion,
    total,
    rentabilidad,
    rentabilidadEA: dias > 0 && 1 + rentabilidad > 0 ? Math.pow(1 + rentabilidad, 365 / dias) - 1 : 0,
  };
}
