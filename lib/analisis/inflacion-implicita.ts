/* Inflación implícita por referencia TES UVR. Funciones puras; no toca lib/engine (solo usa sus
   utilidades de plazo e interpolación de la curva TES, las mismas de la hoja Curva_Rendimiento).
   - Para cada TES UVR: plazo = días reales / 365 desde la fecha de sus tasas; TIR TES TF al mismo
     plazo por interpolación lineal de las referencias tasa fija.
   - Inflación implícita = (1 + TIR TES TF) / (1 + TIR real TES UVR) − 1   (relación de Fisher).
   - Expectativa al mismo plazo: promedio geométrico de la trayectoria de inflación anual esperada
     (encuesta del BanRep cargada) entre hoy y el plazo; más allá del último horizonte de la encuesta
     se mantiene su último dato.
   - Lectura: implícita > expectativa → el mercado cobra más inflación de la que se espera, así que
     protegerse con UVR/IPC sale relativamente barato; implícita < expectativa → tasa fija. */
import { fechaCelda, numeroCelda } from "@/lib/cargas/leer";
import { plazoTES, tirInterpolada, toN, type TuplaFecha } from "@/lib/engine";

/** Meta del BanRep: 3 % con rango de ±1 punto. */
export const META_INFLACION = { centro: 0.03, min: 0.02, max: 0.04 } as const;
/** Brecha (pb) por debajo de la cual la lectura es «en línea». */
export const UMBRAL_PB = 25;

export interface RefUVR {
  titulo: string;
  vencimiento: string;
  /** TIR real E.A. en fracción (0,055). */
  tirReal: number;
}

export interface DatosUVR {
  /** Fecha de las tasas (AAAA-MM-DD). */
  fecha: string;
  fuente: string;
  refs: RefUVR[];
  /** Datos de ejemplo de la página (no de mercado). */
  ejemplo?: boolean;
}

export type Senal = "uvr" | "tf" | "neutral";

export interface FilaImplicita {
  titulo: string;
  vencimiento: string;
  plazo: number;
  tirReal: number;
  tirTF: number;
  implicita: number;
  /** El plazo cae fuera de las referencias tasa fija (la TIR TF se tomó del extremo). */
  extrapolado: boolean;
  expectativa: number | null;
  brechaPb: number | null;
  senal: Senal | null;
}

/** Inflación implícita de Fisher. */
export const fisher = (nominal: number, real: number) => (1 + nominal) / (1 + real) - 1;

/** refsTF: [plazo en años, TIR E.A.], en cualquier orden. */
export function inflacionImplicita(refsTF: [number, number][], uvr: Pick<DatosUVR, "fecha" | "refs">): FilaImplicita[] {
  const tf = [...refsTF].sort((a, b) => a[0] - b[0]);
  if (tf.length < 2) return [];
  return uvr.refs
    .map((r) => {
      const plazo = plazoTES(uvr.fecha, r.vencimiento);
      const tirTF = tirInterpolada(tf, plazo);
      return {
        titulo: r.titulo,
        vencimiento: r.vencimiento,
        plazo,
        tirReal: r.tirReal,
        tirTF,
        implicita: fisher(tirTF, r.tirReal),
        extrapolado: plazo < tf[0][0] || plazo > tf[tf.length - 1][0],
        expectativa: null,
        brechaPb: null,
        senal: null,
      };
    })
    .filter((f) => f.plazo > 0)
    .sort((a, b) => a.plazo - b.plazo);
}

/** Inflación anual esperada en el horizonte de `s` años desde `fecha` (interpolada en la encuesta). */
function esperadaEn(exp: TuplaFecha[], fecha: string, s: number): number {
  const pts = exp.map(([f, v]) => [(toN(f) - toN(fecha)) / 365, v] as [number, number]).sort((a, b) => a[0] - b[0]);
  return tirInterpolada(pts, s); // lineal, plana fuera del rango
}

/** Promedio geométrico de la inflación esperada entre hoy y `t` años (pasos mensuales). */
export function expectativaPromedio(exp: TuplaFecha[], fecha: string, t: number): number | null {
  if (!exp.length || t <= 0) return null;
  if (exp.length === 1) return exp[0][1];
  const n = Math.max(1, Math.round(t * 12));
  let suma = 0;
  for (let k = 1; k <= n; k++) suma += Math.log(1 + esperadaEn(exp, fecha, (k / n) * t));
  return Math.exp(suma / n) - 1;
}

/** Último horizonte de la encuesta, en años desde `fecha`. */
export const horizonteEncuesta = (exp: TuplaFecha[], fecha: string) =>
  exp.length ? Math.max(...exp.map(([f]) => (toN(f) - toN(fecha)) / 365)) : 0;

export function senalDe(brechaPb: number): Senal {
  return brechaPb > UMBRAL_PB ? "uvr" : brechaPb < -UMBRAL_PB ? "tf" : "neutral";
}

export const TEXTO_SENAL: Record<Senal, string> = {
  uvr: "UVR / IPC relativamente más atractivos",
  tf: "Tasa fija relativamente más atractiva",
  neutral: "En línea con las expectativas",
};

/** Agrega expectativa, brecha y señal a cada fila, y una lectura de conjunto. */
export function lecturaImplicita(filas: FilaImplicita[], exp: TuplaFecha[], fecha: string) {
  const conExp = filas.map((f) => {
    const e = expectativaPromedio(exp, fecha, f.plazo);
    if (e == null) return f;
    const brechaPb = (f.implicita - e) * 1e4;
    return { ...f, expectativa: e, brechaPb, senal: senalDe(brechaPb) };
  });
  const brechas = conExp.map((f) => f.brechaPb).filter((b): b is number => b != null);
  if (!brechas.length) return { filas: conExp, resumen: null };
  const brechaMedia = brechas.reduce((s, b) => s + b, 0) / brechas.length;
  const senal = senalDe(brechaMedia);
  const n = (s: Senal) => conExp.filter((f) => f.senal === s).length;
  const fuera = conExp.filter((f) => f.implicita > META_INFLACION.max || f.implicita < META_INFLACION.min).length;
  const texto =
    senal === "uvr"
      ? "El mercado descuenta más inflación de la que esperan los analistas: la protección de los TES UVR y bonos IPC sale relativamente barata, y la tasa fija paga menos de lo que compensaría esa inflación esperada."
      : senal === "tf"
        ? "El mercado descuenta menos inflación de la que esperan los analistas: la tasa fija queda relativamente más atractiva, porque su tasa nominal compensa una inflación menor que la esperada por la encuesta y la protección UVR/IPC sale cara."
        : "La inflación implícita está en línea con las expectativas: el mercado no premia claramente ni la tasa fija ni los títulos indexados.";
  return {
    filas: conExp,
    resumen: { brechaMedia, senal, texto, aFavorUVR: n("uvr"), aFavorTF: n("tf"), neutrales: n("neutral"), fueraDeRango: fuera },
  };
}

/** Lee un CSV de referencias UVR: título; vencimiento; TIR real (en % o fracción).
    Acepta coma, punto y coma o tabulador, encabezado opcional y filas de metadatos
    «fecha;AAAA-MM-DD» y «fuente;texto». */
export function leerCSVUVR(texto: string): { refs: RefUVR[]; fecha: string | null; fuente: string | null; avisos: string[] } | { error: string } {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return { error: "El archivo está vacío." };
  const sep = [";", "\t", ","].find((s) => lineas.some((l) => l.includes(s))) ?? ";";
  const comaDecimal = sep !== ",";
  const refs: RefUVR[] = [];
  let fecha: string | null = null;
  let fuente: string | null = null;
  let omitidas = 0;
  for (const l of lineas) {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const clave = c[0].toLowerCase();
    if (clave === "fecha" && c[1]) {
      fecha = fechaCelda(c[1]);
      continue;
    }
    if (clave === "fuente" && c[1]) {
      fuente = c.slice(1).join(" ").slice(0, 120);
      continue;
    }
    const venc = fechaCelda(c[1] ?? null);
    const tir = numeroCelda(c[2] ?? null, comaDecimal);
    if (!venc || tir == null) {
      omitidas++;
      continue;
    }
    refs.push({ titulo: c[0].slice(0, 60) || `TES UVR ${venc.slice(0, 4)}`, vencimiento: venc, tirReal: Math.round((Math.abs(tir) >= 0.5 ? tir / 100 : tir) * 1e8) / 1e8 });
  }
  if (!refs.length) return { error: "No se encontraron filas con título, vencimiento (AAAA-MM-DD o DD/MM/AAAA) y TIR real." };
  const avisos = omitidas ? [`${omitidas} fila(s) sin vencimiento o TIR válidos se omitieron (p. ej. el encabezado).`] : [];
  return { refs: refs.sort((a, b) => (a.vencimiento < b.vencimiento ? -1 : 1)), fecha, fuente, avisos };
}

/** CSV de las referencias (para descargar y editar). */
export function aCSV(d: DatosUVR): string {
  const n = (x: number) => (x * 100).toFixed(3).replace(".", ",");
  return [`fecha;${d.fecha}`, `fuente;${d.fuente}`, "titulo;vencimiento;tir_real_pct", ...d.refs.map((r) => `${r.titulo};${r.vencimiento};${n(r.tirReal)}`)].join("\n");
}
