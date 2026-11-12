/* Formato de cifras en español de Colombia (coma decimal, punto de miles). */

const cache = new Map<number, Intl.NumberFormat>();
export const nf = (d: number): Intl.NumberFormat => {
  let f = cache.get(d);
  if (!f) {
    f = new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
    cache.set(d, f);
  }
  return f;
};

const ok = (x: number | null | undefined): x is number => x != null && isFinite(x);

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const F = {
  /** Número con d decimales. */
  n: (x: number | null | undefined, d = 3) => (ok(x) ? nf(d).format(x) : "—"),
  /** Fracción como porcentaje: 0,1385 → "13,850 %". */
  pct: (x: number | null | undefined, d = 3) => (ok(x) ? nf(d).format(x * 100) + " %" : "—"),
  /** Pesos sin decimales. */
  cop: (x: number | null | undefined) => (ok(x) ? "$ " + nf(0).format(x) : "—"),
  /** Pesos abreviados: M (millones), mil M, B (billones). */
  copM: (x: number | null | undefined) => {
    if (!ok(x)) return "—";
    const a = Math.abs(x);
    return (
      (x < 0 ? "−" : "") +
      "$ " +
      (a >= 1e12
        ? nf(2).format(a / 1e12) + " B"
        : a >= 1e9
          ? nf(2).format(a / 1e9) + " mil M"
          : a >= 1e6
            ? nf(1).format(a / 1e6) + " M"
            : nf(0).format(a))
    );
  },
  /** Millones de pesos con d decimales: 3541500 → "$ 3,5415 M" (cifras diarias del carry). */
  mill: (x: number | null | undefined, d = 4) => (ok(x) ? (x < 0 ? "−" : "") + "$ " + nf(d).format(Math.abs(x) / 1e6) + " M" : "—"),
  /** Puntos básicos con signo. */
  bp: (x: number | null | undefined) => (ok(x) ? (x > 0 ? "+" : "") + nf(1).format(x) + " pb" : "—"),
  /** "2026-10-30" → "30·oct·2026" */
  date: (s: string) => {
    const [y, m, d] = s.split("-");
    return d + "·" + MESES[+m - 1] + "·" + y;
  },
  /** Mes de referencia: "2026-10-31" → "oct·2026" */
  mes: (s: string) => MESES[+s.slice(5, 7) - 1] + "·" + s.slice(0, 4),
};

/** Eje de porcentaje para gráficos. */
export const pctAx = (d: number) => (v: number) => nf(d).format(v * 100) + "%";
