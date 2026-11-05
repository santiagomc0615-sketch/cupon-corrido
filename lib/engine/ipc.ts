/* Títulos indexados al IPC: tasa = (1+IPC)(1+spread) − 1. Hoja Calculadora_IPC / Cronograma_IPC. */
import { baseSchedule, finish } from "./cronograma";
import { solveYield, trunc3 } from "./finanzas";
import { expect, ipcVigente, type Mercado } from "./mercado";
import type { BonoIPC, ResultadoIPC } from "./types";

export function priceIPC(M: Mercado, b: BonoIPC): ResultadoIPC {
  const S = baseSchedule(b),
    vig = ipcVigente(M, S.val);
  S.rows.forEach((r) => {
    const ref = b.modalidad === "Inicio (Previo)" ? r.start : r.pay;
    r.ref = ref;
    r.H =
      ref <= S.val ? ipcVigente(M, ref).v : b.proyeccion === "IPC vigente" ? vig.v : expect(M, ref);
    r.fuente = ref <= S.val ? "Publicado" : b.proyeccion === "IPC vigente" ? "IPC vigente" : "Expectativa";
    r.saldo = 100;
    r.tasa = (1 + r.H) * (1 + b.spread) - 1;
    r.K = 100 * (Math.pow(1 + r.tasa, r.D / S.B) - 1);
    r.amort = r.last ? 100 : 0;
    r.L = r.K + r.amort;
    r.COP = (r.L / 100) * b.nominal;
  });
  // Descuento encadenado periodo a periodo; devuelve el total y el VP de cada fila.
  const disc = (spr: number) => {
    let R = 0,
      first = true,
      tot = 0;
    const vals: number[] = [];
    S.rows.forEach((r, i) => {
      if (r.N <= 0) {
        vals[i] = 0;
        return;
      }
      const q = (1 + (b.proyeccion === "IPC vigente" ? vig.v : (r.H as number))) * (1 + spr) - 1;
      R = first ? Math.pow(1 + q, -r.t) : R * Math.pow(1 + q, -r.D / S.B);
      first = false;
      tot += r.L * R;
      vals[i] = r.L * R;
    });
    return { tot, vals };
  };
  const dC = disc(b.spreadCompra),
    dV = disc(b.spreadVenta);
  const dirty = trunc3(dC.tot),
    dirtyV = trunc3(dV.tot);
  S.rows.forEach((r, i) => {
    r.vp = dC.vals[i] || 0;
    r.vpV = dV.vals[i] || 0;
  });
  const fl = S.rows.filter((r) => r.N > 0).map((r) => ({ t: r.t, cf: r.L, n: r.pay }));
  const irr = solveYield(fl, dirty, (1 + vig.v) * (1 + b.spreadCompra) - 1),
    irrV = solveYield(fl, dirtyV, (1 + vig.v) * (1 + b.spreadVenta) - 1);
  const accrued =
    b.corrido === "Lineal" ? (S.cur.K * S.dc) / S.cur.D : 100 * (Math.pow(1 + S.cur.tasa, S.dc / S.B) - 1);
  const p = S.F.p;
  const o = {
    tipo: "IPC" as const,
    rows: S.rows,
    flows: fl,
    dirty,
    dirtyV,
    accrued,
    clean: dirty - accrued,
    cleanV: dirtyV - accrued,
    irr,
    irrV,
    nom: p * (Math.pow(1 + irr, 1 / p) - 1),
    nomV: p * (Math.pow(1 + irrV, 1 / p) - 1),
    tasaNeg: (1 + vig.v) * (1 + b.spreadCompra) - 1,
    tasaNegV: (1 + vig.v) * (1 + b.spreadVenta) - 1,
    ipcVig: vig.v,
    ipcMes: vig.mes,
    tirReal: (1 + irr) / (1 + vig.v) - 1,
    tirRealV: (1 + irrV) / (1 + vig.v) - 1,
    tasaCupVig: S.cur.tasa,
    notas: [["IPC vigente (" + vig.mes.slice(0, 7) + ")", vig.v, "pct"]] as ResultadoIPC["notas"],
  };
  return finish(o, b, S, 1);
}
