/* P&G del portafolio completo vendido en una fecha: suma las entradas de cada posición (las que
   vencen antes se toman al vencimiento) y liquida los impuestos sobre el total, porque la tarifa
   del art. 241 depende de la suma. Supuesto: cada título se vende a su misma tasa de compra. */
import { tasaDe } from "@/lib/analisis/comunes";
import { toN, type Bono, type Motor, type ResultadoValoracion, type TuplaFecha, type TuplaIPC } from "@/lib/engine";
import { entradasDesdeMotor } from "./desde-motor";
import type { EntradasPyG } from "./estado";
import { inflacionEntre } from "./inflacion";

export function entradasPortafolio(
  motor: Pick<Motor, "price">,
  posiciones: { b: Bono; o: ResultadoValoracion }[],
  fechaVenta: string,
  inflacion: { ipc: TuplaIPC[]; exp: TuplaFecha[] },
): EntradasPyG | { error: string } {
  if (!posiciones.length) return { error: "El portafolio está vacío." };
  const fechaCompra = posiciones[0].b.valoracion;
  if (!(toN(fechaVenta) > toN(fechaCompra))) return { error: "La fecha de venta debe ser posterior a la valoración del portafolio." };
  const partes: EntradasPyG[] = [];
  for (const { b, o } of posiciones) {
    const alVenc = toN(b.vencimiento) <= toN(fechaVenta);
    const e = entradasDesdeMotor(motor, b, o, alVenc ? { alVencimiento: true } : { fechaVenta, tasaVenta: tasaDe(b) }, inflacion);
    if ("error" in e) return { error: `${b.vencimiento}: ${e.error}` };
    partes.push(e);
  }
  const suma = (f: (e: EntradasPyG) => number) => partes.reduce((s, e) => s + f(e), 0);
  const inf = inflacionEntre(inflacion.ipc, inflacion.exp, fechaCompra, fechaVenta);
  return {
    fechaCompra,
    fechaVenta,
    capital: suma((e) => e.capital),
    limpioCompra: suma((e) => e.limpioCompra),
    corridoCompra: suma((e) => e.corridoCompra),
    limpioVenta: suma((e) => e.limpioVenta),
    corridoVenta: suma((e) => e.corridoVenta),
    cupones: partes.flatMap((e) => e.cupones).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    costoFondeo: 0,
    comisiones: 0,
    inflacion: inf.acumulada,
    inflacionProyectada: inf.proyectada,
    indexado: partes.some((e) => e.indexado),
  };
}
