/* Utilidades financieras: valor presente, TIR, XIRR, duración, convexidad, sensibilidad. */
import type { FilaSensibilidad, Flujo, Riesgo } from "./types";

/** TRUNC(x, 3) de Excel (con margen 1e-9 contra errores de redondeo binario). */
export const trunc3 = (x: number): number => Math.trunc(x * 1000 + 1e-9) / 1000;
/** ROUND(x, 3) */
export const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function pvAt(fl: Pick<Flujo, "t" | "cf">[], y: number): number {
  let s = 0;
  for (const f of fl) s += f.cf / Math.pow(1 + y, f.t);
  return s;
}

/** TIR por Newton-Raphson: tasa y tal que Σ cf/(1+y)^t = price. */
export function solveYield(fl: Pick<Flujo, "t" | "cf">[], price: number, guess = 0.1): number {
  let r = guess;
  for (let k = 0; k < 60; k++) {
    let f = -price,
      d = 0;
    for (const x of fl) {
      const v = x.cf / Math.pow(1 + r, x.t);
      f += v;
      d += (-x.t * v) / (1 + r);
    }
    const nr = r - f / d;
    if (!isFinite(nr)) break;
    if (Math.abs(nr - r) < 1e-12) {
      r = nr;
      break;
    }
    r = nr;
  }
  return r;
}

/** XIRR de Excel (base Real/365). El primer flujo es la inversión inicial. */
export function xirr(cfs: { n: number; cf: number }[]): number {
  const n0 = cfs[0].n;
  const fl = cfs.slice(1).map((c) => ({ t: (c.n - n0) / 365, cf: c.cf }));
  return solveYield(fl, -cfs[0].cf, 0.1);
}

/** Duración Macaulay, modificada (con Macaulay redondeada a 3), DV01 y convexidad. */
export function riskFrom(
  fl: Pick<Flujo, "t" | "cf">[],
  y: number,
  dirty: number,
  nominal: number,
  fx = 1,
): Riesgo {
  let s = 0,
    st = 0,
    stt = 0;
  for (const f of fl) {
    const v = f.cf / Math.pow(1 + y, f.t);
    s += v;
    st += f.t * v;
    stt += f.t * (f.t + 1) * v;
  }
  const mac = st / s,
    mod = r3(mac) / (1 + y);
  return {
    mac,
    macDays: mac * 365,
    mod,
    durPesos: (r3(mod) * dirty) / 100,
    durPos: ((((r3(mod) * dirty) / 100) * nominal) / 100) * fx,
    dv01: ((r3(mod) * dirty) / 100) * nominal * 1e-4 * fx,
    conv: stt / (s * Math.pow(1 + y, 2)),
  };
}

export const PUNTOS_SENSIBILIDAD = [-300, -200, -150, -100, -50, -25, 0, 25, 50, 100, 150, 200, 300];

export function sensitivity(
  fl: Pick<Flujo, "t" | "cf">[],
  y: number,
  dirty: number,
  mod: number,
  conv: number,
  nominal: number,
  fx = 1,
): FilaSensibilidad[] {
  return PUNTOS_SENSIBILIDAD.map((bp) => {
    const r = y + bp / 1e4,
      real = pvAt(fl, r),
      dy = bp / 1e4;
    const eD = dirty * (1 - mod * dy),
      eDC = dirty * (1 - mod * dy + 0.5 * conv * dy * dy);
    return {
      bp,
      r,
      real,
      eD,
      eDC,
      errD: eD - real,
      errDC: eDC - real,
      dVal: ((real - dirty) / 100) * nominal * fx,
    };
  });
}
