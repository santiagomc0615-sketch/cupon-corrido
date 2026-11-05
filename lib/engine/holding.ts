/* Rentabilidad con venta anticipada. Hoja Rentabilidad. */
import { FREQ } from "./cronograma";
import { days, den, toN } from "./fechas";
import { trunc3, xirr } from "./finanzas";
import { elegirCurvaFrac, fracEn, ibrPub, type Mercado } from "./mercado";
import type {
  Bono,
  BonoIBR,
  ErrorValoracion,
  FilaCronograma,
  ResultadoIBR,
  ResultadoValoracion,
  ResultadoVenta,
  ResultadoVentaCurva,
} from "./types";

function validarVenta(b: Bono, ventaS: string): ErrorValoracion | { val: number; sv: number } {
  const val = toN(b.valoracion),
    sv = toN(ventaS);
  if (!(sv > val)) return { error: "La fecha de venta debe ser posterior a la compra" };
  const mat = toN(b.vencimiento);
  if (sv >= mat) return { error: "La venta debe ser antes del vencimiento" };
  return { val, sv };
}

/** TIR del periodo de tenencia: compra, cupones cobrados y venta (XIRR). */
function tirTenencia(val: number, dirty: number, rec: FilaCronograma[], sv: number, pVenta: number): number {
  const cfs = [{ n: val, cf: -dirty }, ...rec.map((r) => ({ n: r.pay, cf: r.L })), { n: sv, cf: pVenta }];
  const merged: { n: number; cf: number }[] = [];
  cfs.forEach((c) => {
    const m = merged.find((x) => x.n === c.n);
    if (m && c !== cfs[0]) m.cf += c.cf;
    else merged.push({ ...c });
  });
  return xirr(merged);
}

/** Venta a una tasa de venta E.A. (método por defecto, todos los títulos). */
export function holding(
  b: Bono,
  o: ResultadoValoracion,
  ventaS: string,
  tasaVenta: number,
): ResultadoVenta | ErrorValoracion {
  const v = validarVenta(b, ventaS);
  if ("error" in v) return v;
  const { val, sv } = v;
  const B = den(b.base),
    fx = o.fx || 1;
  const rec = o.rows.filter((r) => r.pay > val && r.pay <= sv),
    rest = o.rows.filter((r) => r.pay > sv);
  const pv = rest.reduce((s, r) => s + r.L / Math.pow(1 + tasaVenta, days(sv, r.pay, b.base) / B), 0);
  const pVenta = trunc3(pv);
  const tir = tirTenencia(val, o.dirty, rec, sv, pVenta);
  const cup = rec.reduce((s, r) => s + r.L, 0);
  const gan = ((pVenta + cup - o.dirty) / 100) * b.nominal * fx;
  return { pVenta, cupones: cup, ncup: rec.length, tir, gan, dias: sv - val, retorno: (pVenta + cup) / o.dirty - 1 };
}

/** Venta de un título IBR con la curva FRAC de la fecha de venta ("Curva de venta (solo IBR)").
    - IBR de cada periodo: publicado si el periodo empezó antes de la venta (o el vigente si no hay
      dato), y el forward de la curva de venta si empieza después.
    - Flujos: 100 × (IBR + spread facial) × días/base + amortización.
    - Tasa de venta: (1 + (IBR promedio proyectado + spread de venta)/p)^p − 1.
    - Precio sucio de venta: TRUNC(Σ flujo/(1+tasa)^((pago − venta)/365), 3). */
export function holdingCurvaIBR(
  M: Mercado,
  b: BonoIBR,
  o: ResultadoIBR,
  ventaS: string,
  spreadVenta: number,
  curvaId?: string,
): ResultadoVentaCurva | ErrorValoracion {
  const v = validarVenta(b, ventaS);
  if ("error" in v) return v;
  const { val, sv } = v;
  const curva = elegirCurvaFrac(M, sv, curvaId);
  if (!curva.serie) return { error: `La curva FRAC «${curva.nombre}» aún no está cargada` };
  const F = FREQ[b.frecuencia],
    B = den(b.base);
  const lastN = M.ibr[M.ibr.length - 1].n;

  const proy = o.rows.map((r) => {
    const T = r.start <= sv ? (r.start - 1 <= lastN ? ibrPub(M, r.start, F.col).v : o.ibrVig) : fracEn(curva.serie!, r.start);
    const U = (100 * (T + b.spread) * r.D) / B + r.amort;
    return { r, T, U };
  });
  const futuras = proy.filter((x) => x.r.pay > sv);
  const ibrPromVenta = futuras.reduce((s, x) => s + x.T, 0) / futuras.length;
  const tasaVenta = Math.pow(1 + (ibrPromVenta + spreadVenta) / F.p, F.p) - 1;
  const periodos = futuras.map((x) => {
    const vp = x.U / Math.pow(1 + tasaVenta, (x.r.pay - sv) / 365);
    return { pay: x.r.pay, ibr: x.T, flujo: x.U, vp };
  });
  const pVenta = trunc3(periodos.reduce((s, x) => s + x.vp, 0));

  // Cupón corrido a la venta con el IBR de venta del periodo vigente
  const idx = Math.min(proy.length, proy.filter((x) => x.r.pay <= sv).length + 1) - 1;
  const cur = proy[idx];
  const corrido = (cur.U * days(cur.r.start, sv, b.base)) / cur.r.D;

  const rec = o.rows.filter((r) => r.pay > val && r.pay <= sv);
  const tir = tirTenencia(val, o.dirty, rec, sv, pVenta);
  const cup = rec.reduce((s, r) => s + r.L, 0);

  // TIR al vencimiento: flujos cobrados hasta la venta + estimados con la curva de venta
  const tirVencimiento = xirr([
    { n: val, cf: -o.dirty },
    ...proy.filter((x) => x.r.pay > val).map((x) => ({ n: x.r.pay, cf: x.r.pay <= sv ? x.r.L : x.U })),
  ]);

  return {
    pVenta,
    cupones: cup,
    ncup: rec.length,
    tir,
    gan: ((pVenta + cup - o.dirty) / 100) * b.nominal,
    dias: sv - val,
    retorno: (pVenta + cup) / o.dirty - 1,
    corrido,
    limpio: pVenta - corrido,
    ibrPromVenta,
    tasaVenta,
    tirVencimiento,
    curvaId: curva.id,
    curvaNombre: curva.nombre,
    curvaFecha: curva.fechaBase,
    curvaDesfasada: Math.abs(sv - curva.n0) > 10,
    periodos,
  };
}
