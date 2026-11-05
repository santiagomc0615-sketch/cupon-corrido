/* Títulos indexados al IBR: cupón = (IBR + spread) × días/base, IBR del día hábil anterior al
   inicio del periodo. Hoja Calculadora_IBR / Cronograma_IBR. */
import { baseSchedule, finish } from "./cronograma";
import { toN } from "./fechas";
import { solveYield, trunc3 } from "./finanzas";
import { elegirCurvaFrac, fracEn, ibrPub, type Mercado } from "./mercado";
import type { BonoIBR, ResultadoIBR } from "./types";

const PLAZOS_IBR = ["", "", "IBR 1 mes", "IBR 3 meses", "IBR 6 meses", "IBR 12 meses"];

export function priceIBR(M: Mercado, b: BonoIBR): ResultadoIBR {
  const S = baseSchedule(b),
    col = S.F.col,
    lastIBR = M.ibr[M.ibr.length - 1],
    lastN = lastIBR.n;
  const vig = ibrPub(M, S.val, col);
  const vigStale = S.val - 1 > lastN;
  const curva = elegirCurvaFrac(M, S.val, b.curvaFrac);
  const serieFrac = curva.serie;
  if (b.metodologia === "Curva FRAC" && !serieFrac) throw new Error(`la curva FRAC «${curva.nombre}» aún no está cargada`);
  S.rows.forEach((r) => {
    let H: number;
    if (r.start <= S.val) {
      H = ibrPub(M, r.start, col).v;
      r.fuente = "Publicado";
    } else if (b.metodologia === "IBR vigente") {
      H = vig.v;
      r.fuente = "IBR vigente";
    } else {
      H = fracEn(serieFrac!, r.start);
      r.fuente = "FRAC";
    }
    r.H = H;
    r.saldo = 100;
    r.tasa = H + b.spread;
    r.K = (100 * r.tasa * r.D) / S.B;
    r.amort = r.last ? 100 : 0;
    r.L = r.K + r.amort;
    r.COP = (r.L / 100) * b.nominal;
  });
  const fut = S.rows.filter((r) => r.N > 0),
    p = S.F.p;
  const ibrAvg =
    b.metodologia === "IBR vigente" ? vig.v : fut.reduce((s, r) => s + (r.H as number), 0) / fut.length;
  const tirProm = (spr: number) => Math.pow(1 + (ibrAvg + spr) / p, p) - 1;
  // Descuento con TIR del IBR promedio o encadenado por periodo; devuelve total y VP por fila.
  const disc = (spr: number) => {
    let R = 0,
      first = true,
      tot = 0;
    const vals: number[] = [];
    S.rows.forEach((r, i) => {
      vals[i] = 0;
      if (r.N <= 0) return;
      if (b.descuento === "TIR con IBR promedio") R = Math.pow(1 + tirProm(spr), -(r.pay - S.val) / 365);
      else {
        const q = (b.metodologia === "IBR vigente" ? vig.v : (r.H as number)) + spr;
        R = first ? Math.pow(1 + (q * r.D) / S.B, -r.N / r.D) : R / (1 + (q * r.D) / S.B);
      }
      first = false;
      tot += r.L * R;
      vals[i] = r.L * R;
    });
    return { tot, vals };
  };
  const dC = disc(b.spreadCompra),
    dV = disc(b.spreadVenta);
  const calc = trunc3(dC.tot),
    dirtyV = trunc3(dV.tot);
  const precioDado = b.precioDado ?? 0;
  const dirty = precioDado && precioDado > 0 ? precioDado : calc;
  S.rows.forEach((r, i) => {
    r.vp = dC.vals[i] || 0;
    r.vpV = dV.vals[i] || 0;
  });
  const fl = fut.map((r) => ({ t: r.t, cf: r.L, n: r.pay }));
  const irr =
    precioDado > 0 || b.descuento !== "TIR con IBR promedio"
      ? solveYield(fl, dirty, tirProm(b.spreadCompra))
      : tirProm(b.spreadCompra);
  const irrV =
    b.descuento === "TIR con IBR promedio"
      ? tirProm(b.spreadVenta)
      : solveYield(fl, dirtyV, tirProm(b.spreadVenta));
  const accrued = (S.cur.K * S.dc) / S.cur.D;
  const fracStart = curva.fechaBase;
  const o = {
    tipo: "IBR" as const,
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
    ibrVig: vig.v,
    ibrFecha: vig.f,
    ibrStale: vigStale,
    ibrAvg,
    plazoIBR: PLAZOS_IBR[col],
    tasaNeg: vig.v + b.spreadCompra,
    tasaNegV: vig.v + b.spreadVenta,
    tasaNegEA: Math.pow(1 + (vig.v + b.spreadCompra) / p, p) - 1,
    tasaNegEAV: Math.pow(1 + (vig.v + b.spreadVenta) / p, p) - 1,
    fracStart,
    fracStale: b.metodologia === "Curva FRAC" && Math.abs(S.val - toN(fracStart)) > 10,
    curvaFracId: curva.id,
    curvaFracNombre: curva.nombre,
    notas: [[vig.v ? "IBR vigente (" + vig.f + ")" : "IBR", vig.v, "pct"]] as ResultadoIBR["notas"],
  };
  return finish(o, b, S, 1);
}
