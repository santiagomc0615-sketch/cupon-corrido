/* Series cargadas por el usuario y su entrega al motor (lib/engine no cambia):
   - FRAC: entra como una curva FRAC más (DatosMercado.curvasFrac, id «usuario»). La calculadora la
     elige con «Usar estos datos»; la selección automática por fecha también la toma cuando es la curva
     más reciente anterior a la valoración, como si se hubiera cargado en «Cargar datos».
   - Expectativas: reemplazan DatosMercado.exp, la serie que el motor ya usa con «Expectativas».
   Sin datos del usuario, el motor recibe exactamente los mismos datos de siempre. */
import type { CurvaFRACDatos, DatosMercado, TuplaFecha } from "@/lib/engine";
import { F } from "@/lib/format";
import { CONFIG_TIPO, type TipoSerieUsuario } from "./lector";

export const ID_CURVA_USUARIO = "usuario";

export interface SerieUsuario {
  tipo: TipoSerieUsuario;
  /** [fecha ISO, valor en decimal], ordenado por fecha. */
  datos: TuplaFecha[];
  /** Archivo de origen (y hoja, si es un Excel). */
  archivo: string;
  /** Fecha y hora de carga (ISO). */
  cargada: string;
}

export interface DatosUsuario {
  frac?: SerieUsuario | null;
  exp?: SerieUsuario | null;
}

export const SIN_DATOS_USUARIO: DatosUsuario = {};

/** Fecha que se muestra: la de la curva (primera fecha) en FRAC; la de carga en expectativas. */
export const fechaSerie = (s: SerieUsuario) => (s.tipo === "frac" ? s.datos[0][0] : fechaBogota(s.cargada));

/** Fecha (AAAA-MM-DD) de un instante en la hora de Colombia. */
export function fechaBogota(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** «FRAC: cargada por el usuario · 17·nov·2026» / «Expectativas: cargadas por el usuario · 18·nov·2026». */
export const etiquetaSerie = (s: SerieUsuario) =>
  `${CONFIG_TIPO[s.tipo].corto}: ${s.tipo === "frac" ? "cargada" : "cargadas"} por el usuario · ${F.date(fechaSerie(s))}`;

/** La curva FRAC como la recibe el motor. */
export const curvaParaMotor = (s: SerieUsuario): CurvaFRACDatos => ({
  id: ID_CURVA_USUARIO,
  nombre: etiquetaSerie(s),
  fechaBase: s.datos[0][0],
  filas: s.datos.length,
  origen: s.archivo,
  cargada: s.cargada,
  datos: s.datos,
});

/** Datos del motor con las series del usuario. Sin series, el mismo objeto sin cambios. */
export function conDatosUsuario(D: DatosMercado, u: DatosUsuario): DatosMercado {
  let r = D;
  if (u.frac) r = { ...r, curvasFrac: [...(r.curvasFrac ?? []).filter((c) => c.id !== ID_CURVA_USUARIO), curvaParaMotor(u.frac)] };
  if (u.exp) r = { ...r, exp: u.exp.datos };
  return r;
}

/** Valida lo guardado en el navegador (pudo cambiar o dañarse). */
export function serieValida(x: unknown, tipo: TipoSerieUsuario): x is SerieUsuario {
  const s = x as SerieUsuario | null;
  const [min, max] = CONFIG_TIPO[tipo].rango;
  return (
    !!s &&
    s.tipo === tipo &&
    typeof s.archivo === "string" &&
    typeof s.cargada === "string" &&
    Array.isArray(s.datos) &&
    s.datos.length >= 2 &&
    s.datos.every((d) => Array.isArray(d) && typeof d[0] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d[0]) && typeof d[1] === "number" && d[1] >= min && d[1] <= max)
  );
}

/** Solo las series válidas. */
export const datosValidos = (u: DatosUsuario | null | undefined): DatosUsuario => ({
  ...(serieValida(u?.frac, "frac") ? { frac: u!.frac } : {}),
  ...(serieValida(u?.exp, "exp") ? { exp: u!.exp } : {}),
});

/** Convierte la curva guardada por la versión anterior («curvaFracUsuario»). */
export function desdeVersionAnterior(x: unknown): SerieUsuario | null {
  const c = x as { datos?: TuplaFecha[]; archivo?: string; cargada?: string } | null;
  const s = c && { tipo: "frac" as const, datos: c.datos ?? [], archivo: c.archivo ?? "curva FRAC", cargada: c.cargada ?? new Date().toISOString() };
  return serieValida(s, "frac") ? s : null;
}
