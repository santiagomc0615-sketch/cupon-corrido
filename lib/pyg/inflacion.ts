/* Inflación acumulada entre dos fechas con el índice de precios del DANE; si el periodo llega al
   futuro, se proyecta con las expectativas de inflación cargadas (encuesta del BanRep). */
import { tirInterpolada, toN, type TuplaFecha, type TuplaIPC } from "@/lib/engine";

export interface InflacionPeriodo {
  /** Inflación acumulada del periodo (fracción). */
  acumulada: number;
  /** Parte del periodo proyectada con expectativas. */
  proyectada: boolean;
  /** Último mes con índice publicado. */
  ultimoDato: string;
}

/** Índice del IPC en una fecha: interpolado por días entre cierres de mes; después del último dato,
    se proyecta mes a mes con la inflación anual esperada en cada horizonte. */
export function indiceEn(ipc: TuplaIPC[], exp: TuplaFecha[], fecha: string): { indice: number; proyectado: boolean } {
  const pts = ipc.map((r) => [toN(r[0]), r[1]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const n = toN(fecha);
  if (n <= pts[0][0]) return { indice: pts[0][1], proyectado: false };
  const [nu, iu] = pts[pts.length - 1];
  if (n <= nu) {
    let k = 0;
    while (pts[k + 1][0] < n) k++;
    const [a, ia] = pts[k],
      [b, ib] = pts[k + 1];
    return { indice: ia + ((ib - ia) * (n - a)) / (b - a), proyectado: false };
  }
  // Proyección: tasa anual esperada en cada paso (lineal en la encuesta, plana fuera de ella)
  const ref = exp.map(([f, v]) => [toN(f), v] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ultimaAnual = pts.length > 12 ? pts[pts.length - 1][1] / pts[pts.length - 13][1] - 1 : 0.03;
  const esperada = (x: number) => (ref.length ? tirInterpolada(ref, x) : ultimaAnual);
  let indice = iu;
  for (let x = nu; x < n; ) {
    const paso = Math.min(30, n - x);
    indice *= Math.pow(1 + esperada(x + paso / 2), paso / 365);
    x += paso;
  }
  return { indice, proyectado: true };
}

export function inflacionEntre(ipc: TuplaIPC[], exp: TuplaFecha[], desde: string, hasta: string): InflacionPeriodo {
  const a = indiceEn(ipc, exp, desde);
  const b = indiceEn(ipc, exp, hasta);
  return { acumulada: b.indice / a.indice - 1, proyectada: a.proyectado || b.proyectado, ultimoDato: ipc[ipc.length - 1][0] };
}
