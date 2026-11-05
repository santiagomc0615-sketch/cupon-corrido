/* Cronograma base de cupones, validación de entradas y cierre común de resultados. */
import { days, den, edate, toN, toS } from "./fechas";
import { riskFrom, sensitivity } from "./finanzas";
import type { Bono, Comunes, FilaCronograma, Frecuencia, PreResultado } from "./types";

/** p: pagos por año, m: meses por periodo, col: columna del IBR que corresponde al plazo. */
export const FREQ: Record<Frecuencia, { p: number; m: number; col: number }> = {
  Mensual: { p: 12, m: 1, col: 2 },
  Bimestral: { p: 6, m: 2, col: 2 },
  Trimestral: { p: 4, m: 3, col: 3 },
  Semestral: { p: 2, m: 6, col: 4 },
  Anual: { p: 1, m: 12, col: 5 },
};

export interface Cronograma {
  em: number;
  mat: number;
  val: number;
  F: { p: number; m: number; col: number };
  rows: FilaCronograma[];
  /** Periodo vigente a la fecha de valoración. */
  cur: FilaCronograma;
  /** Días corridos del periodo vigente. */
  dc: number;
  B: number;
  diasVto: number;
}

export function baseSchedule(b: Bono): Cronograma {
  const em = toN(b.emision),
    mat = toN(b.vencimiento),
    val = toN(b.valoracion),
    F = FREQ[b.frecuencia];
  const rows: FilaCronograma[] = [];
  for (let i = 1; i < 600; i++) {
    if (edate(em, (i - 1) * F.m) >= mat) break;
    const pay = Math.min(edate(em, i * F.m), mat),
      start = i === 1 ? em : rows[i - 2].pay;
    const D = days(start, pay, b.base),
      N = pay <= val ? 0 : days(val, pay, b.base);
    rows.push({
      i,
      start,
      pay,
      D,
      N,
      t: N / den(b.base),
      estado: pay <= val ? "Pagado" : start <= val ? "Vigente" : "Futuro",
      last: pay === mat,
      // los valoradores llenan estos campos
      saldo: 0,
      tasa: 0,
      K: 0,
      amort: 0,
      L: 0,
      COP: 0,
      vp: 0,
      vpV: 0,
    });
  }
  const idx = Math.min(rows.length, rows.filter((r) => r.pay <= val).length + 1) - 1;
  const cur = rows[Math.max(0, idx)];
  const dc = days(cur.start, val, b.base);
  return { em, mat, val, F, rows, cur, dc, B: den(b.base), diasVto: mat > val ? days(val, mat, b.base) : 0 };
}

/** Devuelve un mensaje de error, un aviso (empieza con "⚠") o null. */
export function validate(b: Bono): string | null {
  if (!b.emision || !b.vencimiento || !b.valoracion) return "Completa las fechas";
  const em = toN(b.emision),
    mat = toN(b.vencimiento),
    val = toN(b.valoracion);
  if (mat <= em) return "El vencimiento debe ser posterior a la emisión";
  if (val < em) return "⚠ Valoración antes de la emisión";
  if (val >= mat) return "⚠ El título ya venció";
  return null;
}

export function condicion(clean: number): string {
  return Math.abs(clean - 100) < 5e-5 ? "A la par" : clean > 100 ? "Con prima" : "Con descuento";
}

/** Completa el resultado con datos del cronograma, valores en pesos, riesgo y sensibilidad. */
export function finish<P extends PreResultado>(o: P, b: Bono, S: Cronograma, fx: number): P & Comunes {
  const r = o as P & Comunes;
  r.cupones = S.rows.length;
  r.pendientes = S.rows.filter((x) => x.N > 0).length;
  r.plazo = S.diasVto / S.B;
  r.diasVto = S.diasVto;
  r.ultimo = toS(S.cur.start);
  r.proximo = toS(S.cur.pay);
  r.diasCorridos = S.dc;
  r.diasPeriodo = S.cur.D;
  r.cond = condicion(r.clean);
  r.condV = condicion(r.cleanV);
  r.giro = (r.dirty / 100) * b.nominal * fx;
  r.giroV = (r.dirtyV / 100) * b.nominal * fx;
  r.corridoCOP = (r.accrued / 100) * b.nominal * fx;
  r.limpioCOP = (r.clean / 100) * b.nominal * fx;
  r.difGiro = r.giroV - r.giro;
  Object.assign(r, riskFrom(r.flows, r.irr, r.dirty, b.nominal, fx));
  r.sens = sensitivity(r.flows, r.irr, r.dirty, r.mod, r.conv, b.nominal, fx);
  r.fx = fx;
  // flujos en pesos con fecha (para portafolio y escalera)
  r.cashCOP =
    r.cashCOP || S.rows.filter((x) => x.N > 0).map((x) => ({ n: x.pay, cop: (x.L / 100) * b.nominal * fx }));
  // TIR en pesos comparable (para portafolio)
  r.yieldCOP = r.yieldCOP != null ? r.yieldCOP : r.irr;
  return r;
}
