/* Solver numérico de una variable, como «Buscar objetivo» de Excel: método de Brent (bisección
   + secante + interpolación cuadrática inversa) sobre un intervalo con cambio de signo.
   - acotar: recorre el rango razonable de la variable y elige el intervalo con cambio de signo más
     cercano al valor actual (así, si hay varias raíces, devuelve la que esperaría el usuario).
   - Las funciones pueden fallar (el motor devuelve error para algunas entradas): esos puntos se saltan. */

export const TOLERANCIA = 1e-8;

export interface Raiz {
  x: number;
  /** f(x) en la solución (≈ 0). */
  fx: number;
  iteraciones: number;
}

export type Evaluar = (x: number) => number;

/** f(x) o NaN si la función falla. */
const seguro = (f: Evaluar, x: number) => {
  try {
    const v = f(x);
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
};

/** Brent en [a, b] con f(a)·f(b) ≤ 0. Tolerancia absoluta en x. */
export function brent(f: Evaluar, a: number, b: number, tol = TOLERANCIA, maxIter = 200): Raiz | null {
  let fa = seguro(f, a),
    fb = seguro(f, b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (fa === 0) return { x: a, fx: 0, iteraciones: 0 };
  if (fb === 0) return { x: b, fx: 0, iteraciones: 0 };
  if (fa * fb > 0) return null;
  if (Math.abs(fa) < Math.abs(fb)) [a, b, fa, fb] = [b, a, fb, fa];
  let c = a,
    fc = fa,
    d = b - a,
    biseccion = true;
  for (let i = 1; i <= maxIter; i++) {
    let s: number;
    if (fa !== fc && fb !== fc) s = (a * fb * fc) / ((fa - fb) * (fa - fc)) + (b * fa * fc) / ((fb - fa) * (fb - fc)) + (c * fa * fb) / ((fc - fa) * (fc - fb));
    else s = b - (fb * (b - a)) / (fb - fa);
    const m = (3 * a + b) / 4;
    if (
      !((s > Math.min(m, b) && s < Math.max(m, b)) as boolean) ||
      (biseccion && Math.abs(s - b) >= Math.abs(b - c) / 2) ||
      (!biseccion && Math.abs(s - b) >= Math.abs(c - d) / 2) ||
      (biseccion && Math.abs(b - c) < tol) ||
      (!biseccion && Math.abs(c - d) < tol)
    ) {
      s = (a + b) / 2;
      biseccion = true;
    } else biseccion = false;
    const fs = seguro(f, s);
    if (!Number.isFinite(fs)) return null;
    d = c;
    c = b;
    fc = fb;
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }
    if (Math.abs(fa) < Math.abs(fb)) [a, b, fa, fb] = [b, a, fb, fa];
    if (fb === 0 || Math.abs(b - a) < tol) return { x: b, fx: fb, iteraciones: i };
  }
  return { x: b, fx: fb, iteraciones: maxIter };
}

/** Intervalo con cambio de signo en [lo, hi], el más cercano a `cerca`. `pasos` puntos en la malla. */
export function acotar(f: Evaluar, lo: number, hi: number, cerca = (lo + hi) / 2, pasos = 80): [number, number] | null {
  const xs = Array.from({ length: pasos + 1 }, (_, k) => lo + ((hi - lo) * k) / pasos);
  const ys = xs.map((x) => seguro(f, x));
  let mejor: [number, number] | null = null;
  let dist = Infinity;
  for (let k = 0; k < pasos; k++) {
    const [y0, y1] = [ys[k], ys[k + 1]];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0 || y1 === 0 || y0 * y1 < 0) {
      const dd = Math.min(Math.abs(xs[k] - cerca), Math.abs(xs[k + 1] - cerca));
      if (dd < dist) {
        dist = dd;
        mejor = [xs[k], xs[k + 1]];
      }
    }
  }
  return mejor;
}

export type Solucion = { ok: true; raiz: Raiz } | { ok: false; motivo: "sin-cambio-de-signo" | "constante" | "fallo"; minimo?: number; maximo?: number };

/** Resuelve f(x) = 0 en el rango razonable [lo, hi]. Si no hay raíz, dice el rango que alcanza f. */
export function resolver(f: Evaluar, lo: number, hi: number, cerca?: number, tol = TOLERANCIA): Solucion {
  const ab = acotar(f, lo, hi, cerca);
  if (ab) {
    const r = brent(f, ab[0], ab[1], tol);
    return r ? { ok: true, raiz: r } : { ok: false, motivo: "fallo" };
  }
  const ys = Array.from({ length: 41 }, (_, k) => seguro(f, lo + ((hi - lo) * k) / 40)).filter(Number.isFinite);
  if (!ys.length) return { ok: false, motivo: "fallo" };
  const minimo = Math.min(...ys),
    maximo = Math.max(...ys);
  return { ok: false, motivo: maximo - minimo < 1e-12 ? "constante" : "sin-cambio-de-signo", minimo, maximo };
}
