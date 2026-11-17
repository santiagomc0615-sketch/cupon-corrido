/* Monitor de spreads. Funciones puras.
   - Spread actual: el que ya calcula el motor (tasa fija: TIR − TIR de la curva TES a su precio;
     UVR: TIR real − TES tasa fija a su duración), en pb.
   - Historia (CSV que sube el usuario): fecha; TIR del título (o de la deuda privada comparable);
     y opcionalmente la TIR de referencia (TES) de ese día. Spread = TIR − referencia. Si el archivo no
     trae referencia, se usa la de hoy del motor para toda la historia (se avisa).
   - Percentil del spread actual dentro de la historia → «barato» (≥ p75: rinde más de lo usual sobre
     la referencia), «caro» (≤ p25) o «en rango». */
import { fechaCelda, numeroCelda } from "@/lib/cargas/leer";
import type { ResultadoValoracion } from "@/lib/engine";

export type Etiqueta = "barato" | "en rango" | "caro";

export interface PuntoSpread {
  fecha: string;
  tir: number;
  referencia: number;
  pb: number;
}

export interface HistoriaSpread {
  puntos: PuntoSpread[];
  /** "archivo": la referencia vino en el CSV; "motor": se usó la de hoy para todas las fechas. */
  referencia: "archivo" | "motor";
  avisos: string[];
}

/** Spread actual del título según el motor, en pb, y la TIR de referencia implícita (o null si el tipo no lo tiene). */
export function spreadActual(o: ResultadoValoracion): { pb: number; referencia: number; descripcion: string } | null {
  if (o.tipo === "TF") return { pb: o.spreadCurve, referencia: o.irrCurve, descripcion: "TIR − TIR de la curva cero TES a su precio" };
  if (o.tipo === "UVR") return { pb: o.spreadUVR, referencia: o.irr - o.spreadUVR / 1e4, descripcion: "TIR real − TES tasa fija a su duración" };
  return null;
}

/** Fracción desde un número que puede venir en % (13,6) o en fracción (0,136). */
const aFraccion = (v: number) => (Math.abs(v) >= 1 ? v / 100 : v);

/** Lee un CSV (coma, punto y coma o tabulador) con fecha, TIR y, opcional, TIR de referencia. */
export function leerHistoriaCSV(texto: string, referenciaHoy: number | null): HistoriaSpread | { error: string } {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return { error: "El archivo está vacío." };
  const sep = [";", "\t", ","].find((s) => lineas[0].includes(s)) ?? ",";
  const avisos: string[] = [];
  const filas: [string, number, number | null][] = [];
  let omitidas = 0;
  // Con coma como separador, los decimales no pueden venir con coma.
  const comaDecimal = sep !== ",";
  for (const l of lineas) {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const f = fechaCelda(c[0]);
    const t = numeroCelda(c[1] ?? null, comaDecimal);
    const r = c[2] != null && c[2] !== "" ? numeroCelda(c[2], comaDecimal) : null;
    if (f && t != null) filas.push([f, aFraccion(t), r != null ? aFraccion(r) : null]);
    else omitidas++;
  }
  if (omitidas && filas.length) avisos.push(`${omitidas} fila(s) sin fecha o TIR válidas se omitieron (p. ej. el encabezado).`);
  if (filas.length < 5) return { error: "Se necesitan al menos 5 fechas con TIR para medir un percentil." };
  const conRef = filas.every((f) => f[2] != null);
  if (!conRef && referenciaHoy == null) return { error: "Para este tipo de título el archivo debe traer una tercera columna con la TIR de referencia." };
  if (!conRef) avisos.push("El archivo no trae la TIR de referencia: se usó la de hoy del motor para todas las fechas.");
  const puntos = filas
    .map(([fecha, tir, ref]) => {
      const referencia = conRef ? (ref as number) : (referenciaHoy as number);
      return { fecha, tir, referencia, pb: (tir - referencia) * 1e4 };
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return { puntos, referencia: conRef ? "archivo" : "motor", avisos };
}

/** Percentil (0–100) de `valor` dentro de `serie`: % de observaciones menores o iguales. */
export function percentil(serie: number[], valor: number): number {
  if (!serie.length) return 0;
  return (serie.filter((x) => x <= valor).length / serie.length) * 100;
}

/** Valor del percentil q (0–100) por interpolación lineal. */
export function cuantil(serie: number[], q: number): number {
  const s = [...serie].sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (q / 100) * (s.length - 1);
  const i = Math.floor(pos);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (pos - i);
}

export function etiquetaSpread(p: number): Etiqueta {
  return p >= 75 ? "barato" : p <= 25 ? "caro" : "en rango";
}

export function evaluarSpread(historia: PuntoSpread[], actualPb: number) {
  const serie = historia.map((x) => x.pb);
  const p = percentil(serie, actualPb);
  return { percentil: p, etiqueta: etiquetaSpread(p), p25: cuantil(serie, 25), p50: cuantil(serie, 50), p75: cuantil(serie, 75), min: Math.min(...serie), max: Math.max(...serie) };
}
