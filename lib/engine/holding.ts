/* Rentabilidad con venta anticipada. Hoja Rentabilidad. */
import { days, den, toN } from "./fechas";
import { trunc3, xirr } from "./finanzas";
import type { Bono, ErrorValoracion, ResultadoValoracion, ResultadoVenta } from "./types";

export function holding(
  b: Bono,
  o: ResultadoValoracion,
  ventaS: string,
  tasaVenta: number,
): ResultadoVenta | ErrorValoracion {
  const val = toN(b.valoracion),
    sv = toN(ventaS);
  if (!(sv > val)) return { error: "La fecha de venta debe ser posterior a la compra" };
  const mat = toN(b.vencimiento);
  if (sv >= mat) return { error: "La venta debe ser antes del vencimiento" };
  const B = den(b.base),
    fx = o.fx || 1;
  const rec = o.rows.filter((r) => r.pay > val && r.pay <= sv),
    rest = o.rows.filter((r) => r.pay > sv);
  const pv = rest.reduce((s, r) => s + r.L / Math.pow(1 + tasaVenta, days(sv, r.pay, b.base) / B), 0);
  const pVenta = trunc3(pv);
  const cfs = [{ n: val, cf: -o.dirty }, ...rec.map((r) => ({ n: r.pay, cf: r.L })), { n: sv, cf: pVenta }];
  const merged: { n: number; cf: number }[] = [];
  cfs.forEach((c) => {
    const m = merged.find((x) => x.n === c.n);
    if (m && c !== cfs[0]) m.cf += c.cf;
    else merged.push({ ...c });
  });
  const tir = xirr(merged);
  const cup = rec.reduce((s, r) => s + r.L, 0);
  const gan = ((pVenta + cup - o.dirty) / 100) * b.nominal * fx;
  return { pVenta, cupones: cup, ncup: rec.length, tir, gan, dias: sv - val, retorno: (pVenta + cup) / o.dirty - 1 };
}
