/* Curva FRAC cargada por el usuario (Excel o CSV) en la calculadora IBR y en Curva TES.
   - Detecta las columnas de fecha y tasa (por encabezado o, si no hay, por contenido), pasa % a decimal
     y valida: fechas en orden, sin vacíos y tasas entre 0 % y 30 %.
   - No toca lib/engine: la curva entra al motor como una curva FRAC más (DatosMercado.curvasFrac, id
     "usuario") solo mientras algún bono IBR con metodología "Curva FRAC" la tiene elegida.
   Funciones puras: reciben las filas ya leídas del archivo. */
import { fechaCelda, numeroCelda, norm, type Celda } from "@/lib/cargas/leer";
import type { CurvaFRACDatos, DatosMercado, TuplaFecha } from "@/lib/engine";
import { F } from "@/lib/format";

export const ID_CURVA_USUARIO = "usuario";
/** Tasas aceptadas (decimal). */
export const RANGO_TASA: [number, number] = [0, 0.3];
const MAX_ERRORES = 6;

export interface CurvaUsuario {
  /** Fecha de la curva (primera fecha). */
  fechaBase: string;
  /** [fecha ISO, IBR forward en decimal], en orden ascendente. */
  datos: TuplaFecha[];
  /** Nombre del archivo de origen. */
  archivo: string;
  /** Fecha y hora de carga (ISO). */
  cargada: string;
}

export type LecturaCurva = { ok: true; curva: CurvaUsuario; avisos: string[] } | { ok: false; errores: string[] };

const esFecha = (s: string) => /fecha|date|dia|plazo/.test(s);
const esTasa = (s: string) => /tasa|ibr|forward|frac|valor|rate|%/.test(s);
const vacia = (x: Celda) => x == null || (typeof x === "string" && x.trim() === "");

/** Columnas de fecha y tasa: por encabezado (primeras 15 filas) o, si no hay, por contenido. */
function columnas(filas: Celda[][]): { desde: number; colF: number; colV: number } | null {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const c = (filas[i] ?? []).map(norm);
    const colF = c.findIndex(esFecha);
    const colV = c.findIndex((x, k) => k !== colF && esTasa(x));
    if (colF >= 0 && colV >= 0 && fechaCelda(filas[i][colF]) == null) return { desde: i + 1, colF, colV };
  }
  // Sin encabezado: la primera fila con una fecha y un número define las columnas.
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const f = filas[i] ?? [];
    const colF = f.findIndex((x) => fechaCelda(x) != null);
    if (colF < 0) continue;
    const colV = f.findIndex((x, k) => k !== colF && typeof x !== "boolean" && !(x instanceof Date) && numeroCelda(x) != null && fechaCelda(x) == null);
    if (colV >= 0) return { desde: i, colF, colV };
  }
  return null;
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Lee y valida una curva FRAC de las filas de una hoja de Excel o de un CSV. */
export function leerCurvaFrac(filas: Celda[][], archivo: string, cargada = new Date().toISOString(), comaDecimal = true): LecturaCurva {
  const col = columnas(filas);
  if (!col) return { ok: false, errores: ["No se encontraron las columnas de fecha y tasa. Use dos columnas: Fecha | Tasa (IBR forward)."] };
  const errores: string[] = [];
  const crudos: { fila: number; fecha: string; v: number }[] = [];

  // Se ignoran las filas totalmente vacías del final; un vacío en medio es un error.
  let ultima = filas.length - 1;
  while (ultima >= col.desde && vacia(filas[ultima]?.[col.colF]) && vacia(filas[ultima]?.[col.colV])) ultima--;
  for (let i = col.desde; i <= ultima; i++) {
    const f = filas[i] ?? [];
    const n = i + 1; // número de fila como lo ve el usuario
    const fecha = fechaCelda(f[col.colF]);
    const v = typeof f[col.colV] === "number" ? (f[col.colV] as number) : numeroCelda(f[col.colV] ?? null, comaDecimal);
    if (vacia(f[col.colF]) && vacia(f[col.colV])) errores.push(`Fila ${n}: está vacía.`);
    else if (!fecha) errores.push(`Fila ${n}: la fecha «${String(f[col.colF] ?? "")}» no es válida (use AAAA-MM-DD o DD/MM/AAAA).`);
    else if (v == null) errores.push(`Fila ${n}: falta la tasa o no es un número.`);
    else crudos.push({ fila: n, fecha, v });
  }
  if (!crudos.length && !errores.length) errores.push("El archivo no tiene filas con fecha y tasa.");

  for (let k = 1; k < crudos.length; k++)
    if (crudos[k].fecha <= crudos[k - 1].fecha) errores.push(`Fila ${crudos[k].fila}: la fecha ${crudos[k].fecha} no es posterior a la anterior (${crudos[k - 1].fecha}).`);

  const avisos: string[] = [];
  const enPct = crudos.length > 0 && Math.abs(mediana(crudos.map((r) => r.v))) >= 1;
  if (enPct) avisos.push("Las tasas venían en %; se pasaron a decimal.");
  const datos: TuplaFecha[] = crudos.map((r) => [r.fecha, enPct ? r.v / 100 : r.v]);
  datos.forEach(([fecha, v], k) => {
    if (!(v >= RANGO_TASA[0] && v <= RANGO_TASA[1])) errores.push(`Fila ${crudos[k].fila}: la tasa ${F.pct(v, 2)} (${fecha}) está fuera del rango razonable (0 % a 30 %).`);
  });
  if (!errores.length && datos.length < 2) errores.push("La curva necesita al menos dos fechas.");

  // en el orden de las filas del archivo
  const filaDe = (e: string) => Number(e.match(/^Fila (\d+)/)?.[1] ?? Infinity);
  errores.sort((a, b) => filaDe(a) - filaDe(b));
  if (errores.length)
    return { ok: false, errores: errores.length > MAX_ERRORES ? [...errores.slice(0, MAX_ERRORES), `… y ${errores.length - MAX_ERRORES} error(es) más.`] : errores };
  return { ok: true, curva: { fechaBase: datos[0][0], datos, archivo, cargada }, avisos };
}

/** Lee varias hojas: usa la primera que tenga una curva válida; si ninguna, los errores de la primera. */
export function leerCurvaFracHojas(hojas: { hoja: string; filas: Celda[][] }[], archivo: string, cargada?: string): LecturaCurva {
  let primera: LecturaCurva | null = null;
  for (const h of hojas) {
    const r = leerCurvaFrac(h.filas, hojas.length > 1 ? `${archivo} · ${h.hoja}` : archivo, cargada);
    if (r.ok) return r;
    primera ??= r;
  }
  return primera ?? { ok: false, errores: ["El archivo no tiene hojas."] };
}

export const nombreCurvaUsuario = (c: Pick<CurvaUsuario, "fechaBase">) => `Curva FRAC del ${F.date(c.fechaBase)} · cargada por el usuario`;

/** La curva como la recibe el motor (una curva FRAC más). */
export const curvaParaMotor = (c: CurvaUsuario): CurvaFRACDatos => ({
  id: ID_CURVA_USUARIO,
  nombre: nombreCurvaUsuario(c),
  fechaBase: c.fechaBase,
  filas: c.datos.length,
  origen: c.archivo,
  cargada: c.cargada,
  datos: c.datos,
});

/** ¿Algún bono eligió la curva del usuario? (calculadora, portafolio o curva de venta).
    Solo entonces entra al motor: así la selección automática por fecha y los bonos con
    «IBR vigente» siguen usando las curvas de siempre. */
export function curvaUsuarioEnUso(entradas: Record<string, unknown>[], curvaVenta?: string | null): boolean {
  return curvaVenta === ID_CURVA_USUARIO || entradas.some((e) => e.curvaFrac === ID_CURVA_USUARIO);
}

/** Datos del motor con la curva del usuario (si la hay). Sin curva, los mismos datos sin cambios. */
export function conCurvaUsuario(D: DatosMercado, c: CurvaUsuario | null): DatosMercado {
  if (!c) return D;
  return { ...D, curvasFrac: [...(D.curvasFrac ?? []).filter((x) => x.id !== ID_CURVA_USUARIO), curvaParaMotor(c)] };
}

/** Valida lo guardado en el navegador (pudo cambiar o dañarse). */
export function curvaGuardadaValida(x: unknown): x is CurvaUsuario {
  const c = x as CurvaUsuario | null;
  return (
    !!c &&
    typeof c.fechaBase === "string" &&
    Array.isArray(c.datos) &&
    c.datos.length >= 2 &&
    c.datos.every((d) => Array.isArray(d) && typeof d[0] === "string" && typeof d[1] === "number" && d[1] >= RANGO_TASA[0] && d[1] <= RANGO_TASA[1])
  );
}
