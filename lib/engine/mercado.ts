/* Series de mercado (IBR, IPC, UVR, FRAC, expectativas, curva cero TES).
   `prepararMercado` reemplaza al `load()` del prototipo: no modifica los datos de entrada,
   devuelve un objeto nuevo que se pasa a cada función del motor. */
import { addBizDays, toN } from "./fechas";

/* ---------- Datos crudos (formato de datos-mercado.json) ---------- */
/** [título, vencimiento, cupón, TIR, plazo en años] */
export type TuplaTES = [string, string, number, number, number];
/** [fecha, overnight, 1 mes, 3 meses, 6 meses, 12 meses] en % N.A. */
export type TuplaIBR = [string, number, number, number, number, number];
/** [fecha, índice, ...otros campos que el motor no usa] */
export type TuplaIPC = [string, number, ...unknown[]];
/** [fecha, valor] */
export type TuplaFecha = [string, number];

export interface DatosMercado {
  curveDate: string;
  tes: TuplaTES[];
  /** [plazo en años, tasa cero cupón E.A.] */
  zero: [number, number][];
  ibr: TuplaIBR[];
  ipc: TuplaIPC[];
  exp: TuplaFecha[];
  /** Curva FRAC por defecto (hoja Curva_FRAC del Excel). */
  frac: TuplaFecha[];
  uvr: TuplaFecha[];
  /** Curvas FRAC adicionales cargadas por el usuario. `datos` puede faltar si aún no se descargó. */
  curvasFrac?: CurvaFRACDatos[];
}

/** Curva FRAC tal como se guarda y se transmite: [fecha ISO, IBR forward en fracción]. */
export interface CurvaFRACDatos {
  id: string;
  nombre: string;
  /** Primera fecha de la curva (fecha de la curva). */
  fechaBase: string;
  /** Cantidad de filas. */
  filas: number;
  /** Hoja o archivo de origen. */
  origen?: string;
  /** Fecha y hora de carga (ISO). */
  cargada?: string;
  datos?: TuplaFecha[];
}

/** Id de la curva FRAC que viene en el Excel del curso. */
export const CURVA_EXCEL = "excel";

/* ---------- Datos preparados ---------- */
export interface FilaSerie<T> {
  /** Fecha ISO */
  f: string;
  /** Fecha como número de días */
  n: number;
  d: T;
}

export interface FilaIPC extends FilaSerie<TuplaIPC> {
  /** Variación anual (null en los primeros 12 meses). */
  annual: number | null;
  /** Fecha desde la que rige: 5.º día hábil del mes siguiente + 1. */
  vig: number;
}

export interface FilaIPCV extends FilaIPC {
  annual: number;
}

export interface Mercado {
  curveDate: string;
  tes: TuplaTES[];
  zero: [number, number][];
  ibr: FilaSerie<TuplaIBR>[];
  uvr: FilaSerie<TuplaFecha>[];
  frac: FilaSerie<TuplaFecha>[];
  exp: FilaSerie<TuplaFecha>[];
  ipc: FilaIPC[];
  /** IPC con variación anual disponible. */
  ipcV: FilaIPCV[];
  /** Todas las curvas FRAC disponibles: la del Excel primero y luego las cargadas. */
  curvasFrac: CurvaFRAC[];
}

export interface CurvaFRAC {
  id: string;
  nombre: string;
  fechaBase: string;
  /** fechaBase como número de días */
  n0: number;
  filas: number;
  /** null si la curva aún no se ha descargado. */
  serie: FilaSerie<TuplaFecha>[] | null;
}

const prep = <T extends [string, ...unknown[]]>(a: T[]): FilaSerie<T>[] =>
  a.map((d) => ({ f: d[0], n: toN(d[0]), d }));

export function prepararMercado(D: DatosMercado): Mercado {
  const ipc: FilaIPC[] = prep(D.ipc).map((r) => ({ ...r, annual: null, vig: 0 }));
  ipc.forEach((r, i) => {
    r.annual = i >= 12 ? r.d[1] / ipc[i - 12].d[1] - 1 : null;
    r.vig = addBizDays(r.n, 5) + 1;
  });
  const frac = prep(D.frac);
  const curvasFrac: CurvaFRAC[] = [
    { id: CURVA_EXCEL, nombre: "Excel del curso (Curva_FRAC)", fechaBase: frac[0].f, n0: frac[0].n, filas: frac.length, serie: frac },
    ...(D.curvasFrac ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      fechaBase: c.fechaBase,
      n0: toN(c.fechaBase),
      filas: c.filas,
      serie: c.datos ? prep(c.datos) : null,
    })),
  ];
  return {
    curveDate: D.curveDate,
    tes: D.tes,
    zero: D.zero.slice().sort((a, b) => a[0] - b[0]),
    ibr: prep(D.ibr),
    uvr: prep(D.uvr),
    frac,
    exp: prep(D.exp),
    ipc,
    ipcV: ipc.filter((r): r is FilaIPCV => r.annual != null),
    curvasFrac,
  };
}

/** Curva FRAC para una fecha: la pedida por id; si no, la de fecha base igual a n;
    si no, la más reciente con fecha base anterior a n; si no, la más antigua. */
export function elegirCurvaFrac(M: Mercado, n: number, id?: string): CurvaFRAC {
  const cs = M.curvasFrac;
  if (id) {
    const c = cs.find((x) => x.id === id);
    if (c) return c;
  }
  const exacta = cs.find((x) => x.n0 === n);
  if (exacta) return exacta;
  let mejor: CurvaFRAC | null = null;
  for (const c of cs) if (c.n0 <= n && (!mejor || c.n0 > mejor.n0)) mejor = c;
  if (mejor) return mejor;
  return cs.reduce((a, b) => (b.n0 < a.n0 ? b : a));
}

/** IBR forward de una curva en la fecha n (último dato con fecha ≤ n; el primero si n es anterior). */
export function fracEn(serie: FilaSerie<TuplaFecha>[], n: number): number {
  const i = lastLE(serie, n);
  return serie[Math.max(0, i)].d[1];
}

/** Índice del último elemento con fecha ≤ n (búsqueda binaria), o −1. */
export function lastLE(arr: { n: number }[], n: number): number {
  let lo = 0,
    hi = arr.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].n <= n) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** IPC 12 meses vigente en la fecha n. */
export function ipcVigente(M: Mercado, n: number): { v: number; mes: string } {
  const a = M.ipcV;
  let k = -1;
  for (let i = 0; i < a.length; i++) if (a[i].vig <= n) k = i;
  if (k < 0) k = 0;
  return { v: a[k].annual, mes: a[k].f };
}

/** Expectativa de inflación vigente en la fecha n. */
export function expect(M: Mercado, n: number): number {
  const i = lastLE(M.exp, n);
  return M.exp[Math.max(0, i)].d[1];
}

/** UVR en la fecha n; después del último dato se extrapola con el IPC vigente. */
export function uvrAt(M: Mercado, n: number): { v: number; f: string; extrap: boolean } {
  const a = M.uvr,
    i = lastLE(a, n);
  if (i < 0) return { v: a[0].d[1], f: a[0].f, extrap: true };
  if (i === a.length - 1 && n > a[i].n) {
    const inf = ipcVigente(M, n).v;
    return { v: a[i].d[1] * Math.pow(1 + inf, (n - a[i].n) / 365), f: a[i].f, extrap: true };
  }
  return { v: a[i].d[1], f: a[i].f, extrap: false };
}

/** Último IBR publicado antes de n (día hábil anterior). col: 1 ON, 2 1M, 3 3M, 4 6M, 5 12M. */
export function ibrPub(M: Mercado, n: number, col: number): { v: number; f: string } {
  const a = M.ibr,
    i = lastLE(a, n - 1);
  const k = Math.max(0, i);
  return { v: (a[k].d[col] as number) / 100, f: a[k].f };
}

/** Tasa de la curva FRAC en la fecha n. */
export function frac(M: Mercado, n: number): number {
  return fracEn(M.frac, n);
}

/** Curva cero cupón TES: interpolación lineal, plana fuera de rango. */
export function spot(M: Mercado, t: number): number {
  const z = M.zero;
  if (t <= z[0][0]) return z[0][1];
  if (t >= z[z.length - 1][0]) return z[z.length - 1][1];
  for (let i = 1; i < z.length; i++)
    if (t <= z[i][0]) {
      const [t0, r0] = z[i - 1],
        [t1, r1] = z[i];
      return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
    }
  return z[z.length - 1][1];
}
