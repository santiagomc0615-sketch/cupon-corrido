/* Títulos en UVR: flujos en UVR, UVR proyectada con inflación, TIR en pesos con XIRR.
   Hoja Calculadora_UVR / Cronograma_UVR. */
import { baseSchedule, finish } from "./cronograma";
import { pvAt, trunc3, xirr } from "./finanzas";
import { expect, ipcVigente, spot, uvrAt, type Mercado } from "./mercado";
import type { BonoUVR, FlujoCOP, ResultadoUVR } from "./types";

export function priceUVR(M: Mercado, b: BonoUVR): ResultadoUVR {
  const S = baseSchedule(b),
    c = b.cupon,
    u0 = uvrAt(M, S.val),
    vig = ipcVigente(M, S.val);
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
  const dirty = trunc3(pvAt(fl, b.tasaCompra)),
    dirtyV = trunc3(pvAt(fl, b.tasaVenta));
  const accrued =
    b.corrido === "Lineal" ? (S.cur.K * S.dc) / S.cur.D : 100 * (Math.pow(1 + c, S.dc / S.B) - 1);
  // UVR proyectada y flujos en pesos
  let prev: number | null = null;
  const cash: FlujoCOP[] = [];
  S.rows.forEach((r) => {
    r.vp = r.N > 0 ? r.L / Math.pow(1 + b.tasaCompra, r.t) : 0;
    r.vpV = r.N > 0 ? r.L / Math.pow(1 + b.tasaVenta, r.t) : 0;
    if (r.N <= 0) {
      r.uvrP = 0;
      r.cop = 0;
      return;
    }
    const infl = b.proyeccion === "IPC vigente" ? vig.v : expect(M, r.pay);
    r.infl = infl;
    const uvrP: number =
      prev == null
        ? u0.v * Math.pow(1 + infl, (r.pay - S.val) / 365)
        : prev * Math.pow(1 + infl, (r.pay - r.start) / 365);
    r.uvrP = uvrP;
    prev = uvrP;
    r.cop = (r.L / 100) * b.nominal * uvrP;
    cash.push({ n: r.pay, cop: r.cop });
  });
  const giroCOP = (dirty / 100) * b.nominal * u0.v;
  const tirPesos = xirr([{ n: S.val, cf: -giroCOP }, ...cash.map((x) => ({ n: x.n, cf: x.cop }))]);
  const p = S.F.p;
  const o = {
    tipo: "UVR" as const,
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
    uvr: u0.v,
    uvrFecha: u0.f,
    uvrExtrap: u0.extrap,
    ipcVig: vig.v,
    tirPesos,
    fisher: (1 + b.tasaCompra) * (1 + vig.v) - 1,
    rendCorriente: (c * 100) / (dirty - accrued),
    nominalCOP: b.nominal * u0.v,
    cashCOP: cash,
    yieldCOP: tirPesos,
    notas: [["UVR a la valoración", u0.v, "num4"]] as ResultadoUVR["notas"],
    // se completan después de finish (necesitan la duración)
    tesDur: 0,
    spreadUVR: 0,
    spreadPesos: 0,
  };
  const r = finish(o, b, S, u0.v);
  r.tesDur = spot(M, r.mac);
  r.spreadUVR = (r.irr - r.tesDur) * 1e4;
  r.spreadPesos = (tirPesos - r.tesDur) * 1e4;
  return r;
}
