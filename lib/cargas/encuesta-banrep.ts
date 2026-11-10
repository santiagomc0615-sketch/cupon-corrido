/* Encuesta Mensual de Expectativas de Analistas Económicos (EME) del Banco de la República,
   tal como se descarga de su página (archivo res_inf_<mes><año>.xlsx u otro nombre).
   Hoja usada: «INFLACION TOT» (IPC total). Bloque «todas las entidades», fila «Mediana»,
   columnas «% Anual en dic/2024», «%Anual en oct./2025»… (la columna «% mensual» se ignora).
   Los horizontes se convierten en la serie mensual que usa el motor (expectativa de inflación anual
   vigente desde el primer día de cada mes), interpolando en línea recta entre horizontes.
   Función pura: recibe las filas ya leídas. */
import { toN, toS, type TuplaFecha } from "@/lib/engine";
import { norm, numeroCelda, type Celda } from "./leer";

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/** ¿La hoja es de la encuesta del BanRep? */
export function esEncuestaBanRep(filas: Celda[][]): boolean {
  return filas.slice(0, 6).some((f) => (f ?? []).some((c) => norm(c).includes("encuesta mensual de expectativas")));
}

/** ¿Es la hoja de inflación total (no núcleo, sin alimentos, regulados…)? */
export function esInflacionTotal(hoja: string, filas: Celda[][]): boolean {
  const n = norm(hoja);
  if (/^inflacion\s*tot/.test(n)) return true;
  return filas.slice(0, 8).some((f) => (f ?? []).some((c) => /precios al consumidor \(ipc\) total/.test(norm(c))));
}

/** "% Anual en dic/2024", "%Anual en oct./2025" → "2024-12-01". */
export function mesHorizonte(texto: Celda): string | null {
  const m = norm(texto).match(/anual en\s*([a-z]{3})[a-z]*\.?\s*\/?\s*(\d{4})/);
  if (!m || !MESES[m[1]]) return null;
  return `${m[2]}-${String(MESES[m[1]]).padStart(2, "0")}-01`;
}

/** Fecha de realización: «Fecha de realización: del 8 de octubre al 10 de octubre de 2024» → texto. */
function fechaRealizacion(filas: Celda[][]): string | null {
  for (const f of filas.slice(0, 6)) for (const c of f ?? []) if (norm(c).startsWith("fecha de realizacion")) return String(c).trim();
  return null;
}

/** Suma meses a "AAAA-MM-01". */
const masMeses = (f: string, k: number) => {
  const y = +f.slice(0, 4),
    m = +f.slice(5, 7) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}-01`;
};

export interface EncuestaLeida {
  /** Mediana por horizonte: [primer día del mes, inflación anual en fracción]. */
  horizontes: TuplaFecha[];
  /** Serie mensual interpolada para el motor. */
  datos: TuplaFecha[];
  realizacion: string | null;
  avisos: string[];
}

export function leerEncuestaBanRep(filas: Celda[][]): EncuestaLeida {
  const avisos: string[] = [];
  const iCab = filas.findIndex((f) => norm(f?.[0]).startsWith("medidas estadisticas") && (f ?? []).some((c) => mesHorizonte(c)));
  if (iCab < 0) throw new Error("Encuesta BanRep: no se encontró la fila «Medidas estadísticas» con los horizontes.");
  const cols = (filas[iCab] ?? []).map((c, j) => [j, mesHorizonte(c)] as const).filter((x): x is readonly [number, string] => Boolean(x[1]));
  // Primera fila «Mediana» después del encabezado = todas las entidades participantes.
  const iMed = filas.findIndex((f, i) => i > iCab && norm(f?.[0]) === "mediana");
  if (iMed < 0) throw new Error("Encuesta BanRep: no se encontró la fila «Mediana».");

  const m = new Map<string, number>();
  for (const [j, f] of cols) {
    let v = numeroCelda(filas[iMed]?.[j] ?? null);
    if (v == null) continue;
    if (Math.abs(v) >= 1) v /= 100; // en % → fracción
    m.set(f, v);
  }
  const horizontes = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) as TuplaFecha[];
  if (horizontes.length < 2) throw new Error("Encuesta BanRep: la mediana trae menos de dos horizontes.");

  // Serie mensual: cada mes entre horizontes, interpolando en línea recta por días.
  const datos: TuplaFecha[] = [];
  for (let k = 0; k < horizontes.length - 1; k++) {
    const [f0, v0] = horizontes[k],
      [f1, v1] = horizontes[k + 1];
    const n0 = toN(f0),
      n1 = toN(f1);
    for (let f = f0; f < f1; f = masMeses(f, 1)) datos.push([f, v0 + ((v1 - v0) * (toN(f) - n0)) / (n1 - n0)]);
  }
  datos.push(horizontes[horizontes.length - 1]);
  avisos.push(
    `Encuesta del BanRep: mediana de ${horizontes.length} horizontes (${horizontes.map(([f]) => toS(toN(f)).slice(0, 7)).join(", ")}), interpolada mes a mes.`,
  );
  return { horizontes, datos, realizacion: fechaRealizacion(filas), avisos };
}
