/* Fechas como número de días desde 1970-01-01 (UTC), igual que el motor del prototipo. */
import type { Base } from "./types";

export const DAY = 864e5;

export const toN = (s: string): number =>
  Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;

export const toS = (n: number): string => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);

export const ymd = (n: number): [number, number, number] => {
  const d = new Date(Math.round(n) * DAY);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
};

/** Día de la semana: 0 domingo … 6 sábado. */
export const wd = (n: number): number => new Date(Math.round(n) * DAY).getUTCDay();

/** EDATE de Excel: suma m meses, recortando al último día del mes. */
export function edate(n: number, m: number): number {
  const [y, mo, d] = ymd(n);
  const t = mo + m;
  const yy = y + Math.floor(t / 12),
    mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return Date.UTC(yy, mm, Math.min(d, last)) / DAY;
}

/** Cantidad de 29 de febrero en el intervalo (a, b]. */
export function feb29In(a: number, b: number): number {
  let c = 0;
  const [y1] = ymd(a),
    [y2] = ymd(b);
  for (let y = y1; y <= y2; y++) {
    if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) {
      const f = Date.UTC(y, 1, 29) / DAY;
      if (f > a && f <= b) c++;
    }
  }
  return c;
}

/** Días entre a y b según la base. 30/360 = DAYS360 europeo (TRUE). */
export function days(a: number, b: number, basis: Base): number {
  if (basis === "30/360") {
    const [y1, m1, a1] = ymd(a);
    const [y2, m2, a2] = ymd(b);
    const d1 = Math.min(a1, 30);
    const d2 = Math.min(a2, 30);
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
  }
  let r = b - a;
  if (basis === "365/365") r -= feb29In(a, b);
  return r;
}

/** Denominador de la base. */
export const den = (b: Base): number => (b === "30/360" || b === "Real/360" ? 360 : 365);

/** Suma k días hábiles (lunes a viernes, sin festivos). */
export function addBizDays(n: number, k: number): number {
  let d = n;
  while (k > 0) {
    d++;
    const w = wd(d);
    if (w !== 0 && w !== 6) k--;
  }
  return d;
}
