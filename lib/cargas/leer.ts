/* Lectura de archivos Excel (varias hojas) y CSV para la sección /datos.
   Cada hoja se reconoce por sus encabezados (no por el nombre), con el formato del Excel del curso:
   título en la fila 1, encabezados en la fila 3 y datos desde la fila 4.
   - Curva FRAC:       Fecha | IBR forward (fracción)            → puede haber varias hojas
   - Expectativas IPC: Fecha | Inflación anual esperada
   - Datos_IPC:        Mes (fin de mes) | Índice IPC
   - Datos_IBR:        Fecha | … | IBR 12 meses (en %)            → se toma solo el IBR 12M
   - Curva_Rendimiento: Fecha de la curva + Título | Emisión | Vencimiento | Cupón | TIR mercado
   Funciones puras: reciben las filas ya leídas del archivo. */
import { toN, toS, type TuplaFecha } from "@/lib/engine";
import type { RefTES, TipoSerieCargada } from "./tipos";

export type Celda = string | number | boolean | Date | null | undefined;
export interface HojaLeida {
  hoja: string;
  filas: Celda[][];
}

interface Base {
  hoja: string;
  avisos: string[];
}
export type Detectada =
  | (Base & { tipo: "frac"; titulo: string; datos: TuplaFecha[]; sugerido: string })
  | (Base & { tipo: TipoSerieCargada; datos: TuplaFecha[] })
  | (Base & { tipo: "tes"; fecha: string; refs: RefTES[] })
  | (Base & { tipo: "ignorada"; motivo: string });

/** Texto en minúsculas y sin tildes, para comparar encabezados. */
export const norm = (x: Celda): string =>
  String(x ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Fecha de una celda: Date, número de serie de Excel o texto (AAAA-MM-DD o DD/MM/AAAA). */
export function fechaCelda(x: Celda): string | null {
  if (x instanceof Date && !Number.isNaN(x.getTime()))
    return toS(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / 864e5);
  if (typeof x === "number" && x > 1000 && x < 120000) return toS(Math.round(x) - 25569);
  if (typeof x === "string") {
    const s = x.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return valida(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return valida(+m[3], +m[2], +m[1]);
  }
  return null;
}
function valida(y: number, m: number, d: number): string | null {
  const f = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return toS(toN(f)) === f ? f : null;
}

/** Número de una celda (acepta "11,26", "11.26", "11,26 %"). */
export function numeroCelda(x: Celda, comaDecimal = true): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  let s = x.trim().replace(/\s|%/g, "");
  if (!s) return null;
  if (comaDecimal && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Busca la fila de encabezados (primeras 15 filas) que cumpla `prueba`. */
function filaEncabezado(filas: Celda[][], prueba: (celdas: string[]) => boolean): number {
  for (let i = 0; i < Math.min(15, filas.length); i++) if (prueba((filas[i] ?? []).map(norm))) return i;
  return -1;
}

/** Lee pares (fecha, valor) de dos columnas desde la fila siguiente al encabezado. */
function pares(filas: Celda[][], desde: number, colF: number, colV: number, f: (v: number) => number = (v) => v) {
  const datos: TuplaFecha[] = [];
  let omitidas = 0;
  for (let i = desde; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const fe = fechaCelda(fila[colF]),
      v = numeroCelda(fila[colV] ?? null);
    if (fe && v != null) datos.push([fe, f(v)]);
    else if (fila[colF] != null || fila[colV] != null) omitidas++;
  }
  // orden ascendente, sin fechas repetidas (gana la última)
  const m = new Map(datos);
  const orden = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) as TuplaFecha[];
  return { datos: orden, omitidas, reordenadas: orden.length !== datos.length || orden.some((r, i) => r[0] !== datos[i]?.[0]) };
}

/** Si los valores parecen estar en % (la mediana es 1 o más), los pasa a fracción. */
function aFraccion(datos: TuplaFecha[], avisos: string[]): TuplaFecha[] {
  const abs = datos.map(([, v]) => Math.abs(v)).sort((a, b) => a - b);
  const mediana = abs.length ? abs[Math.floor(abs.length / 2)] : 0;
  if (mediana >= 1) {
    avisos.push("Los valores venían en %; se convirtieron a fracción.");
    return datos.map(([f, v]) => [f, v / 100]);
  }
  // Serie en fracción con algunas filas sueltas en %: se corrigen esas filas y se avisa.
  const sueltas = datos.filter(([, v]) => Math.abs(v) >= 1);
  if (sueltas.length) {
    avisos.push(
      `${sueltas.length} fila(s) venían en % en una serie en fracción (${sueltas[0][0]}${sueltas.length > 1 ? " a " + sueltas[sueltas.length - 1][0] : ""}); se dividieron entre 100. Revise el archivo.`,
    );
    return datos.map(([f, v]) => [f, Math.abs(v) >= 1 ? v / 100 : v]);
  }
  return datos;
}

function avisosPares(r: { omitidas: number; reordenadas: boolean }, avisos: string[]) {
  if (r.omitidas) avisos.push(`${r.omitidas} filas sin fecha o valor válidos se omitieron.`);
  if (r.reordenadas) avisos.push("Las fechas se ordenaron de forma ascendente (y se quitaron repetidas).");
}

const HOJAS_EN_VIVO = /^(datos_uvr)$/i;

export function detectarHoja({ hoja, filas }: HojaLeida): Detectada {
  const avisos: string[] = [];
  const titulo = String(filas[0]?.find((c) => c != null && String(c).trim()) ?? "");
  const t = norm(titulo);

  /* Curva_Rendimiento: referencias TES */
  const hTes = filaEncabezado(filas, (c) => c.includes("titulo") && c.includes("vencimiento") && c.some((x) => x.startsWith("tir")));
  if (hTes >= 0) {
    const enc = (filas[hTes] ?? []).map(norm);
    const cT = enc.indexOf("titulo"),
      cV = enc.indexOf("vencimiento"),
      cC = enc.findIndex((x) => x.startsWith("cupon")),
      cR = enc.findIndex((x) => x.startsWith("tir"));
    let fecha: string | null = null;
    for (let i = 0; i < hTes && !fecha; i++) {
      const fila = filas[i] ?? [];
      const k = fila.findIndex((c) => norm(c).startsWith("fecha de la curva"));
      if (k >= 0) fecha = fila.slice(k + 1).map(fechaCelda).find(Boolean) ?? null;
    }
    const refs: RefTES[] = [];
    for (let i = hTes + 1; i < filas.length; i++) {
      const fila = filas[i] ?? [];
      const nombre = String(fila[cT] ?? "").trim(),
        venc = fechaCelda(fila[cV]),
        cup = numeroCelda(fila[cC] ?? null),
        tir = numeroCelda(fila[cR] ?? null);
      if (!nombre || !venc || cup == null || tir == null) {
        if (refs.length) break; // fin de la tabla
        continue;
      }
      refs.push([nombre, venc, cup >= 1 ? cup / 100 : cup, tir >= 1 ? tir / 100 : tir]);
    }
    if (!fecha) avisos.push("No se encontró la «Fecha de la curva»: escríbala antes de guardar.");
    return { tipo: "tes", hoja, avisos, fecha: fecha ?? "", refs };
  }

  /* Curva FRAC (una o varias hojas) */
  const hFrac = filaEncabezado(filas, (c) => c[0]?.startsWith("fecha") && c.some((x) => x.includes("ibr forward")));
  if (hFrac >= 0 || (t.includes("frac") && filaEncabezado(filas, (c) => c[0]?.startsWith("fecha")) >= 0)) {
    const h = hFrac >= 0 ? hFrac : filaEncabezado(filas, (c) => c[0]?.startsWith("fecha"));
    const enc = (filas[h] ?? []).map(norm);
    const col = Math.max(1, enc.findIndex((x) => x.includes("ibr forward")));
    const r = pares(filas, h + 1, 0, col);
    avisosPares(r, avisos);
    const datos = aFraccion(r.datos, avisos);
    const venta = /venta/.test(norm(hoja)) || /venta/.test(t);
    return { tipo: "frac", hoja, avisos, titulo, datos, sugerido: venta ? "Venta" : "Compra" };
  }

  /* Expectativas de inflación */
  const hExp = filaEncabezado(filas, (c) => c[0]?.startsWith("fecha") && c.some((x) => x.includes("inflacion") && x.includes("esperada")));
  if (hExp >= 0 || t.includes("expectativas de inflacion")) {
    const h = hExp >= 0 ? hExp : filaEncabezado(filas, (c) => c[0]?.startsWith("fecha"));
    const r = pares(filas, h + 1, 0, 1);
    avisosPares(r, avisos);
    return { tipo: "exp", hoja, avisos, datos: aFraccion(r.datos, avisos) };
  }

  /* Histórico IPC (índice) */
  const hIpc = filaEncabezado(filas, (c) => /^(mes|fecha)/.test(c[0] ?? "") && c.some((x) => x.startsWith("indice ipc")));
  if (hIpc >= 0) {
    const enc = (filas[hIpc] ?? []).map(norm);
    const r = pares(filas, hIpc + 1, 0, enc.findIndex((x) => x.startsWith("indice ipc")));
    avisosPares(r, avisos);
    const desde = r.datos.filter(([f]) => f >= "2015-01-01");
    if (desde.length < r.datos.length) avisos.push(`Se toman los datos desde 2015 (${desde.length} meses); el índice anterior no se usa.`);
    return { tipo: "ipc", hoja, avisos, datos: desde };
  }

  /* Histórico IBR: solo el plazo de 12 meses (los demás llegan en vivo) */
  const hIbr = filaEncabezado(filas, (c) => (c[0] ?? "").startsWith("fecha") && c.some((x) => x.startsWith("ibr 12 meses")));
  if (hIbr >= 0) {
    const enc = (filas[hIbr] ?? []).map(norm);
    const r = pares(filas, hIbr + 1, 0, enc.findIndex((x) => x.startsWith("ibr 12 meses")), (v) => v / 100);
    // las filas antiguas sin IBR 12M (empezó en 2022) no son un error
    avisosPares({ ...r, omitidas: 0 }, avisos);
    avisos.push("Se toma solo el IBR a 12 meses (en % → fracción); overnight a 6 meses llegan en vivo del BanRep.");
    return { tipo: "ibr12", hoja, avisos, datos: r.datos };
  }

  if (HOJAS_EN_VIVO.test(hoja)) return { tipo: "ignorada", hoja, avisos, motivo: "La UVR se actualiza en vivo desde el BanRep." };
  return { tipo: "ignorada", hoja, avisos, motivo: "No es una hoja de datos reconocida." };
}

export function detectarHojas(hojas: HojaLeida[]): Detectada[] {
  return hojas.map(detectarHoja);
}

/* ---------- CSV ---------- */

export type TipoCSV = "frac" | TipoSerieCargada | "tes";

/** Separa un CSV en filas y celdas (separador ; , o tabulador, comillas dobles). */
export function filasCSV(texto: string): { filas: string[][]; comaDecimal: boolean } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const muestra = lineas.slice(0, 5).join("\n");
  const sep = (muestra.match(/;/g)?.length ?? 0) > 0 ? ";" : (muestra.match(/\t/g)?.length ?? 0) > 0 ? "\t" : ",";
  const filas = lineas.map((l) => {
    const out: string[] = [];
    let cur = "",
      q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  });
  return { filas, comaDecimal: sep !== "," };
}

/** CSV de dos columnas (fecha;valor) o, para TES, título;vencimiento;cupón;TIR. */
export function detectarCSV(nombre: string, texto: string, tipo: TipoCSV, fechaTES = ""): Detectada {
  const avisos: string[] = [];
  const { filas, comaDecimal } = filasCSV(texto);
  const sinEncabezado = filas.filter((f) => (tipo === "tes" ? fechaCelda(f[1]) : fechaCelda(f[0])));
  if (filas.length > sinEncabezado.length) avisos.push(`${filas.length - sinEncabezado.length} filas de encabezado o sin fecha se omitieron.`);
  if (tipo === "tes") {
    const refs: RefTES[] = sinEncabezado
      .map((f): RefTES | null => {
        const v = fechaCelda(f[1]),
          c = numeroCelda(f[2], comaDecimal),
          r = numeroCelda(f[3], comaDecimal);
        return f[0] && v && c != null && r != null ? [f[0], v, c >= 1 ? c / 100 : c, r >= 1 ? r / 100 : r] : null;
      })
      .filter((x): x is RefTES => x != null);
    return { tipo: "tes", hoja: nombre, avisos, fecha: fechaTES, refs };
  }
  const crudo = sinEncabezado
    .map((f): TuplaFecha | null => {
      const fe = fechaCelda(f[0]),
        v = numeroCelda(f[1], comaDecimal);
      return fe && v != null ? [fe, v] : null;
    })
    .filter((x): x is TuplaFecha => x != null);
  const m = new Map(crudo);
  let datos = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) as TuplaFecha[];
  if (tipo !== "ipc") datos = aFraccion(datos, avisos);
  if (tipo === "frac") {
    const venta = /venta/i.test(nombre);
    return { tipo: "frac", hoja: nombre, avisos, titulo: nombre, datos, sugerido: venta ? "Venta" : "Compra" };
  }
  return { tipo, hoja: nombre, avisos, datos };
}

/** Id único para una curva FRAC nueva. */
export function idCurva(fechaBase: string): string {
  return `frac-${fechaBase}-${Math.random().toString(36).slice(2, 8)}`;
}
