/* Métricas del portafolio (del prototipo): valor de mercado, TIR y duración ponderadas,
   DV01, composición, pruebas de estrés con revaloración completa y escalera de flujos. */
import { toS } from "./fechas";
import { pvAt } from "./finanzas";
import type { Bono, ResultadoValoracion, TipoBono } from "./types";

export interface PosicionValorada<P = unknown> {
  p: P;
  b: Bono;
  o: ResultadoValoracion;
}

export function pfMetrics(V: PosicionValorada[]) {
  const mv = V.reduce((s, x) => s + x.o.giro, 0);
  const w = (x: PosicionValorada) => x.o.giro / mv;
  const byType: Partial<Record<TipoBono, number>> = {};
  V.forEach((x) => {
    byType[x.b.tipo] = (byType[x.b.tipo] || 0) + x.o.giro;
  });
  const shock = (fn: (mac: number) => number) =>
    V.reduce((s, x) => {
      const dy = fn(x.o.mac);
      const np = pvAt(x.o.flows, x.o.irr + dy);
      return s + ((np - pvAt(x.o.flows, x.o.irr)) / 100) * x.b.nominal * x.o.fx;
    }, 0);
  const stress: [string, number][] = [
    ["−200 pb", shock(() => -0.02)],
    ["−100 pb", shock(() => -0.01)],
    ["−50 pb", shock(() => -0.005)],
    ["+50 pb", shock(() => 0.005)],
    ["+100 pb", shock(() => 0.01)],
    ["+200 pb", shock(() => 0.02)],
    ["Empinamiento", shock((t) => (t - 3) * 0.0015)],
    ["Aplanamiento", shock((t) => -(t - 3) * 0.0015)],
  ];
  const lad: Record<string, Record<TipoBono, number>> = {};
  V.forEach((x) =>
    x.o.cashCOP.forEach((c) => {
      const y = toS(c.n).slice(0, 4);
      lad[y] = lad[y] || { TF: 0, IBR: 0, IPC: 0, UVR: 0 };
      lad[y][x.b.tipo] += c.cop;
    }),
  );
  return {
    mv,
    n: V.length,
    ytm: V.reduce((s, x) => s + w(x) * x.o.yieldCOP, 0),
    mod: V.reduce((s, x) => s + w(x) * x.o.mod, 0),
    mac: V.reduce((s, x) => s + w(x) * x.o.mac, 0),
    conv: V.reduce((s, x) => s + w(x) * x.o.conv, 0),
    dv01: V.reduce((s, x) => s + x.o.dv01, 0),
    byType,
    stress,
    ladder: Object.keys(lad)
      .sort()
      .map((y) => [y, lad[y]] as [string, Record<TipoBono, number>]),
  };
}

export type MetricasPortafolio = ReturnType<typeof pfMetrics>;
