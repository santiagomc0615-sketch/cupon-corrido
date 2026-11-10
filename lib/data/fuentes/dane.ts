/* DANE — anexo mensual del IPC «Índices - Serie de empalme» (base diciembre de 2018 = 100).
   Se publica cada mes en una ruta con el mes de referencia:
   https://www.dane.gov.co/files/operaciones/IPC/oct2026/anex-IPC-Indices-oct2026.xlsx
   Es la fuente primaria: el dato aparece aquí el mismo día de la rueda de prensa del DANE.
   Solo se usa desde el servidor. */

const MESES_URL = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TIEMPO_MAX_MS = 30_000;

/** Fila del IPC como la usa el motor: [fin de mes ISO, índice, (sin uso), fecha de publicación]. */
export type FilaIpcDane = [string, number, null, string | null];

export interface IpcDane {
  serie: FilaIpcDane[];
  /** Fecha que el DANE imprime en el anexo («Actualizado el 9 de noviembre de 2026»), ISO. */
  publicado: string | null;
  /** Mes de referencia del anexo leído (AAAA-MM). */
  mes: string;
  url: string;
}

export function urlIndicesDane(anio: number, mes1: number): string {
  const m = MESES_URL[mes1 - 1] + anio;
  return `https://www.dane.gov.co/files/operaciones/IPC/${m}/anex-IPC-Indices-${m}.xlsx`;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const finDeMes = (anio: number, mes1: number) => new Date(Date.UTC(anio, mes1, 0)).toISOString().slice(0, 10);

/** «Actualizado el 9 de Noviembre de 2026» → "2026-11-09". */
export function fechaActualizado(texto: string): string | null {
  const m = sinTildes(texto).match(/actualizado el (\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!m) return null;
  const mes = MESES_NOMBRE.indexOf(m[2]);
  if (mes < 0) return null;
  return `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Lee la hoja del anexo (filas = meses, columnas = años). Función pura. */
export function leerIndicesDane(filas: unknown[][]): { serie: FilaIpcDane[]; publicado: string | null } {
  const iCab = filas.findIndex((r) => typeof r[0] === "string" && sinTildes(r[0]) === "mes");
  if (iCab < 0) throw new Error("DANE IPC: no se encontró la fila de encabezado «Mes».");
  const anios = filas[iCab].map((v) => (typeof v === "number" && v > 1900 && v < 2200 ? v : null));
  const serie: FilaIpcDane[] = [];
  for (const r of filas.slice(iCab + 1)) {
    if (typeof r[0] !== "string") continue;
    const mes = MESES_NOMBRE.indexOf(sinTildes(r[0]));
    if (mes < 0) continue;
    r.forEach((v, c) => {
      const anio = anios[c];
      if (anio && typeof v === "number" && Number.isFinite(v) && v > 0) serie.push([finDeMes(anio, mes + 1), v, null, null]);
    });
  }
  if (!serie.length) throw new Error("DANE IPC: el anexo no trae índices.");
  serie.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let publicado: string | null = null;
  for (const r of filas) if (typeof r[0] === "string" && (publicado = fechaActualizado(r[0]))) break;
  // La fecha de publicación del anexo corresponde al último mes que trae.
  if (publicado) serie[serie.length - 1][3] = publicado;
  return { serie, publicado };
}

/** Meses de referencia a probar (AAAA, 1–12), del más reciente esperado hacia atrás. */
export function mesesCandidatos(hoyISO: string, n = 3): [number, number][] {
  let anio = +hoyISO.slice(0, 4),
    mes = +hoyISO.slice(5, 7);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
    out.push([anio, mes]);
  }
  return out;
}

/** Mes (AAAA-MM) cuyo IPC se espera ya publicado: el anterior a hoy. */
export const mesEsperado = (hoyISO: string) => {
  const [a, m] = mesesCandidatos(hoyISO, 1)[0];
  return `${a}-${String(m).padStart(2, "0")}`;
};

/** Días del mes en que el DANE suele publicar el IPC del mes anterior (rueda de prensa entre el 4 y el 14). */
export const enVentanaDane = (hoyISO: string) => {
  const d = +hoyISO.slice(8, 10);
  return d >= 4 && d <= 14;
};

/** Descarga y lee el anexo más reciente disponible (prueba el mes anterior y luego dos más atrás). */
export async function ipcDane(hoyISO: string): Promise<IpcDane> {
  const { default: leerXlsx } = await import("read-excel-file/node");
  const errores: string[] = [];
  for (const [anio, mes] of mesesCandidatos(hoyISO)) {
    const url = urlIndicesDane(anio, mes);
    const r = await fetch(url, { signal: AbortSignal.timeout(TIEMPO_MAX_MS), cache: "no-store" });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !tipo.includes("spreadsheet")) {
      errores.push(`${MESES_URL[mes - 1]}${anio}: HTTP ${r.status}`);
      continue;
    }
    const hojas = await leerXlsx(Buffer.from(await r.arrayBuffer()));
    const hoja = Array.isArray(hojas) ? (hojas[0] as { data?: unknown[][] }) : null;
    const filas = (hoja?.data ?? hojas) as unknown[][];
    const { serie, publicado } = leerIndicesDane(filas);
    return { serie, publicado, mes: `${anio}-${String(mes).padStart(2, "0")}`, url };
  }
  throw new Error("DANE IPC: anexo no disponible (" + errores.join("; ") + ")");
}
