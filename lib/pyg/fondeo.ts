/* Fondeo en el P&G, con la misma lógica de lib/carry: monto fondeado = giro × (1 − haircut) y
   capital propio = giro × haircut. El préstamo se capitaliza a la tasa E.A. del fondeo y los cupones
   (intereses y amortizaciones) lo van pagando: nunca hay cupones capitalizados y fondeo no, ni al
   revés. Al vender, el saldo se paga con el producto de la venta.
   Costo de fondeo = todo lo pagado al prestamista − el monto fondeado (los intereses del préstamo). */
import { toN } from "@/lib/engine";
import type { EntradasPyG } from "./estado";

export interface FondeoPyG {
  /** Monto fondeado al comprar: giro × (1 − haircut). */
  fondeado: number;
  /** Tasa del fondeo E.A. (la misma del panel de carry). */
  tasaEA: number;
  /** Texto para el aviso, p. ej. «simultánea 12,25 %, haircut 10 %». */
  descripcion: string;
}

export interface DetalleFondeo {
  fondeado: number;
  capitalPropio: number;
  tasaEA: number;
  /** Intereses del préstamo durante la tenencia. */
  costo: number;
  /** Cupones que se usaron para pagar el préstamo. */
  pagadoConCupones: number;
  /** Saldo que se paga con la venta. */
  saldoAlVender: number;
}

export function simularFondeo(e: EntradasPyG, f: Pick<FondeoPyG, "fondeado" | "tasaEA">): DetalleFondeo {
  const crecer = (saldo: number, desde: number, hasta: number) => saldo * Math.pow(1 + f.tasaEA, Math.max(0, hasta - desde) / 365);
  let saldo = f.fondeado;
  let t = toN(e.fechaCompra);
  let pagado = 0;
  for (const c of [...e.cupones].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
    const n = toN(c.fecha);
    saldo = crecer(saldo, t, n);
    t = n;
    const abono = Math.min(saldo, c.interes + c.amort);
    saldo -= abono;
    pagado += abono;
  }
  saldo = crecer(saldo, t, toN(e.fechaVenta));
  return {
    fondeado: f.fondeado,
    capitalPropio: e.capital - f.fondeado,
    tasaEA: f.tasaEA,
    costo: pagado + saldo - f.fondeado,
    pagadoConCupones: pagado,
    saldoAlVender: saldo,
  };
}

/** Entradas del P&G con el fondeo incluido: costo del préstamo y % sobre el capital propio. */
export function conFondeo(e: EntradasPyG, f: Pick<FondeoPyG, "fondeado" | "tasaEA">): EntradasPyG {
  const d = simularFondeo(e, f);
  return { ...e, costoFondeo: d.costo, fondeo: d };
}
