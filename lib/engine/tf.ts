/* Títulos a tasa fija (TES TF, CDT, bonos). Hoja Calculadora_TF / Cronograma_TF. */
import { baseSchedule, finish } from "./cronograma";
import { pvAt, solveYield, trunc3 } from "./finanzas";
import { spot, type Mercado } from "./mercado";
import type { BonoTF, ResultadoTF } from "./types";

export function priceTF(M: Mercado, b: BonoTF): ResultadoTF {
  const S = baseSchedule(b),
    c = b.cupon;
  S.rows.forEach((r) => {
    r.saldo = 100;
    r.tasa = c;
    const J = Math.pow(1 + c, r.D / S.B) - 1;
    r.J = J;
    r.K = 100 * J;
    r.amort = r.last ? 100 : 0;
    r.L = r.K + r.amort;
    r.COP = (r.L / 100) * b.nominal;
  });
  const fl = S.rows.filter((r) => r.N > 0).map((r) => ({ t: r.t, cf: r.L, n: r.pay }));
  const pv = (y: number) => pvAt(fl, y);
  const dirty = trunc3(pv(b.tasaCompra)),
    dirtyV = trunc3(pv(b.tasaVenta));
  const accrued =
    b.corrido === "Lineal" ? (S.cur.K * S.dc) / S.cur.D : 100 * (Math.pow(1 + c, S.dc / S.B) - 1);
  S.rows.forEach((r) => {
    r.vp = r.N > 0 ? r.L / Math.pow(1 + b.tasaCompra, r.t) : 0;
    r.vpV = r.N > 0 ? r.L / Math.pow(1 + b.tasaVenta, r.t) : 0;
    const z = r.N > 0 ? spot(M, r.t) : 0;
    r.z = z;
    r.vpZ = r.N > 0 ? r.L / Math.pow(1 + z, r.t) : 0;
  });
  const pCurve = S.rows.reduce((s, r) => s + (r.vpZ as number), 0),
    irrCurve = solveYield(fl, pCurve, b.tasaCompra);
  const p = S.F.p;
  const o = {
    tipo: "TF" as const,
    rows: S.rows,
    flows: fl,
    dirty,
    dirtyV,
    accrued,
    clean: dirty - accrued,
    cleanV: dirtyV - accrued,
    irr: b.tasaCompra,
    irrV: b.tasaVenta,
    nom: p * (Math.pow(1 + b.tasaCompra, 1 / p) - 1),
    nomV: p * (Math.pow(1 + b.tasaVenta, 1 / p) - 1),
    rendCorriente: (c * 100) / (dirty - accrued),
    pCurve,
    irrCurve,
    spreadCurve: (b.tasaCompra - irrCurve) * 1e4,
    notas: [["Tasa cupón facial", c, "pct"]] as ResultadoTF["notas"],
  };
  return finish(o, b, S, 1);
}
