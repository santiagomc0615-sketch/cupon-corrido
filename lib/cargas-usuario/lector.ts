/* Lector robusto de series del usuario (Excel o CSV) para la calculadora y Curva TES:
   - Curva FRAC (FRA IBR): fecha y tasa forward.
   - Expectativas / pronósticos de inflación: fecha (o mes/año) e inflación anual.
   Reglas:
   - Varias hojas o columnas: se sugieren la hoja y las columnas de fecha y valor, y se pueden cambiar.
   - % a decimal (11,17 → 0,1117); fechas de Excel, dd/mm/aaaa, aaaa-mm-dd y, en inflación, mes/año.
   - Se descartan (y se cuentan con su motivo) las filas sin número (#REF!, vacías, texto), con fecha
     inválida o con el valor fuera de rango (FRAC 0 % a 30 %; inflación −5 % a 30 %).
   - Se ordena por fecha y se avisa si hay fechas repetidas (queda la última).
   Funciones puras: reciben las filas ya leídas del archivo. */
import { fechaCelda, norm, numeroCelda, type Celda } from "@/lib/cargas/leer";
import type { TuplaFecha } from "@/lib/engine";
import { F, nf } from "@/lib/format";

export type TipoSerieUsuario = "frac" | "exp";

export const CONFIG_TIPO: Record<TipoSerieUsuario, { nombre: string; corto: string; rango: [number, number]; rangoTexto: string; valor: string; pista: RegExp }> = {
  frac: { nombre: "Curva FRAC (FRA IBR)", corto: "FRAC", rango: [0, 0.3], rangoTexto: "0 % a 30 %", valor: "Tasa forward", pista: /tasa|ibr|fra|forward|rate|valor/ },
  exp: {
    nombre: "Expectativas / pronósticos de inflación",
    corto: "Expectativas",
    rango: [-0.05, 0.3],
    rangoTexto: "−5 % a 30 %",
    valor: "Inflación anual",
    pista: /inflaci|expect|pronost|ipc|mediana|valor/,
  },
};

export interface Columna {
  indice: number;
  /** Encabezado (o «Columna A» si no hay). */
  nombre: string;
  fechas: number;
  numeros: number;
}

export interface AnalisisHoja {
  hoja: string;
  /** Fila donde empiezan los datos (después del encabezado, si lo hay). */
  desde: number;
  columnas: Columna[];
  /** Columnas sugeridas (-1 si no se encontró). */
  colFecha: number;
  colValor: number;
}

export interface Seleccion {
  hoja: number;
  colFecha: number;
  colValor: number;
}

export interface Descartes {
  sinNumero: number;
  fechaInvalida: number;
  fueraDeRango: number;
}

export interface SerieLeida {
  tipo: TipoSerieUsuario;
  /** [fecha ISO, valor en decimal], ordenado por fecha y sin repetidas. */
  datos: TuplaFecha[];
  descartes: Descartes;
  /** Fechas que venían repetidas (se dejó la última). */
  repetidas: number;
  enPorcentaje: boolean;
  avisos: string[];
}

export type Lectura = { ok: true; serie: SerieLeida } | { ok: false; error: string; descartes?: Descartes };

const letra = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : "C" + (i + 1));
const vacia = (x: Celda) => x == null || (typeof x === "string" && x.trim() === "");

const MESES: Record<string, number> = {
  ene: 1, enero: 1, jan: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, apr: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, aug: 8, sep: 9, sept: 9, septiembre: 9, set: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
  dic: 12, diciembre: 12, dec: 12,
};
const primerDia = (y: number, m: number) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, "0")}-01` : null);

/** Mes y año en texto: 2027-03, 03/2027, 3-2027, mar-2027, marzo de 2027, 2027M03 → primer día del mes. */
export function mesAnio(x: Celda): string | null {
  if (typeof x !== "string") return null;
  const s = norm(x).replace(/\s+de\s+/g, " ");
  let m = s.match(/^(\d{4})[-/.m](\d{1,2})$/);
  if (m) return primerDia(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return primerDia(+m[2], +m[1]);
  m = s.match(/^([a-z]+)\.?[\s\-/]*(\d{4}|\d{2})$/);
  if (m && MESES[m[1]]) return primerDia(m[2].length === 2 ? 2000 + +m[2] : +m[2], MESES[m[1]]);
  return null;
}

/** Fecha de una celda; en inflación acepta también mes/año. */
export const fechaDe = (x: Celda, tipo: TipoSerieUsuario): string | null => fechaCelda(x) ?? (tipo === "exp" ? mesAnio(x) : null);

/** Número de una celda que no sea una fecha (las fechas de Excel también son números). */
const numeroDe = (x: Celda, comaDecimal: boolean): number | null => (x instanceof Date || typeof x === "boolean" ? null : numeroCelda(x, comaDecimal));

/** Analiza una hoja: fila de encabezado, columnas y las sugeridas para fecha y valor. */
export function analizarHoja(hoja: string, filas: Celda[][], tipo: TipoSerieUsuario, comaDecimal = true): AnalisisHoja {
  const ancho = Math.min(40, Math.max(0, ...filas.slice(0, 200).map((f) => f?.length ?? 0)));
  // Encabezado: la última fila de texto (sin fechas ni números) antes de la primera fila con fecha y número.
  // (una fila con números no es encabezado: puede ser un dato con la fecha mal escrita, que se cuenta como descartado)
  let primerDato = -1;
  let filaEnc = -1;
  for (let i = 0; i < Math.min(30, filas.length); i++) {
    const f = filas[i] ?? [];
    const numeros = f.filter((c) => fechaDe(c, tipo) == null && numeroDe(c, comaDecimal) != null).length;
    if (f.some((c) => fechaDe(c, tipo)) && numeros > 0) {
      primerDato = i;
      break;
    }
    const textos = f.filter((c) => typeof c === "string" && c.trim() && fechaDe(c, tipo) == null && numeroDe(c, comaDecimal) == null).length;
    if (textos >= 1 && numeros === 0 && f.filter((c) => !vacia(c)).length >= 2) filaEnc = i;
  }
  const encabezado: Celda[] | null = filaEnc >= 0 ? filas[filaEnc] : null;
  const desde = filaEnc >= 0 && (primerDato < 0 || filaEnc < primerDato) ? filaEnc + 1 : Math.max(0, primerDato);
  const muestra = filas.slice(desde, desde + 300);
  const columnas: Columna[] = Array.from({ length: ancho }, (_, k) => {
    const titulo = encabezado?.[k];
    return {
      indice: k,
      nombre: typeof titulo === "string" && titulo.trim() ? titulo.trim() : `Columna ${letra(k)}`,
      fechas: muestra.filter((f) => fechaDe(f?.[k], tipo) != null).length,
      numeros: muestra.filter((f) => fechaDe(f?.[k], tipo) == null && numeroDe(f?.[k], comaDecimal) != null).length,
    };
  });
  const porFecha = [...columnas].filter((c) => c.fechas > 0).sort((a, b) => b.fechas - a.fechas || +/fecha|mes|periodo|date/.test(norm(b.nombre)) - +/fecha|mes|periodo|date/.test(norm(a.nombre)));
  const colFecha = porFecha[0]?.indice ?? -1;
  const numericas = columnas.filter((c) => c.indice !== colFecha && c.numeros > 0);
  const conPista = numericas.filter((c) => CONFIG_TIPO[tipo].pista.test(norm(c.nombre)));
  const colValor = (conPista[0] ?? [...numericas].sort((a, b) => b.numeros - a.numeros)[0])?.indice ?? -1;
  return { hoja, desde, columnas, colFecha, colValor };
}

/** Analiza todas las hojas y elige la sugerida (la que tenga más filas con fecha y valor). */
export function analizarArchivo(hojas: { hoja: string; filas: Celda[][] }[], tipo: TipoSerieUsuario, comaDecimal = true) {
  const analisis = hojas.map((h) => analizarHoja(h.hoja, h.filas, tipo, comaDecimal));
  const puntaje = (a: AnalisisHoja) => (a.colFecha >= 0 && a.colValor >= 0 ? Math.min(a.columnas[a.colFecha].fechas, a.columnas[a.colValor].numeros) : -1);
  let mejor = 0;
  analisis.forEach((a, i) => {
    if (puntaje(a) > puntaje(analisis[mejor])) mejor = i;
  });
  const a = analisis[mejor];
  return { analisis, sugerida: { hoja: mejor, colFecha: a?.colFecha ?? -1, colValor: a?.colValor ?? -1 } as Seleccion };
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Lee la serie con las columnas elegidas: descarta, convierte, ordena y avisa. */
export function leerSerie(filas: Celda[][], a: Pick<AnalisisHoja, "desde">, colFecha: number, colValor: number, tipo: TipoSerieUsuario, comaDecimal = true): Lectura {
  const cfg = CONFIG_TIPO[tipo];
  if (colFecha < 0 || colValor < 0) return { ok: false, error: "Elija la columna de fecha y la de valor." };
  if (colFecha === colValor) return { ok: false, error: "La columna de fecha y la de valor deben ser distintas." };
  const descartes: Descartes = { sinNumero: 0, fechaInvalida: 0, fueraDeRango: 0 };

  // Filas totalmente vacías al final del rango: no cuentan.
  let ultima = filas.length - 1;
  while (ultima >= a.desde && vacia(filas[ultima]?.[colFecha]) && vacia(filas[ultima]?.[colValor])) ultima--;

  const crudos: TuplaFecha[] = [];
  for (let i = a.desde; i <= ultima; i++) {
    const f = filas[i] ?? [];
    const v = numeroDe(f[colValor], comaDecimal);
    if (v == null) {
      descartes.sinNumero++;
      continue;
    }
    const fecha = fechaDe(f[colFecha], tipo);
    if (!fecha) {
      descartes.fechaInvalida++;
      continue;
    }
    crudos.push([fecha, v]);
  }

  const enPorcentaje = Math.abs(mediana(crudos.map((r) => r[1]))) >= 1;
  const enRango: TuplaFecha[] = [];
  for (const [fecha, v0] of crudos) {
    // % → decimal sin ruido de coma flotante (11,166 → 0,11166 y no 0,11166000000000001)
    const v = enPorcentaje ? +(v0 / 100).toPrecision(12) : v0;
    if (v >= cfg.rango[0] && v <= cfg.rango[1]) enRango.push([fecha, v]);
    else descartes.fueraDeRango++;
  }

  // Orden por fecha; si una fecha se repite queda la última.
  const porFecha = new Map<string, number>();
  let repetidas = 0;
  for (const [fecha, v] of enRango) {
    if (porFecha.has(fecha)) repetidas++;
    porFecha.set(fecha, v);
  }
  const datos = [...porFecha.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)) as TuplaFecha[];
  const desordenada = enRango.some((r, k) => k > 0 && r[0] < enRango[k - 1][0]);

  if (datos.length < 2)
    return { ok: false, error: `Quedan ${datos.length} fila(s) válidas: se necesitan al menos dos. ${textoDescartes(descartes, tipo)}`.trim(), descartes };

  const avisos: string[] = [];
  if (enPorcentaje) avisos.push("Los valores venían en %; se pasaron a decimal (11,17 → 0,1117).");
  const d = textoDescartes(descartes, tipo);
  if (d) avisos.push(d);
  if (repetidas) avisos.push(`${nf(0).format(repetidas)} fecha(s) repetida(s): se dejó el último valor de cada una.`);
  if (desordenada) avisos.push("Las fechas no venían en orden; se ordenaron.");
  return { ok: true, serie: { tipo, datos, descartes, repetidas, enPorcentaje, avisos } };
}

/** «Se descartaron 32 filas: 26 sin número (#REF!, vacías o texto), 5 fuera de rango (0 % a 30 %), 1 con fecha inválida.» */
export function textoDescartes(d: Descartes, tipo: TipoSerieUsuario): string {
  const total = d.sinNumero + d.fechaInvalida + d.fueraDeRango;
  if (!total) return "";
  const partes = [
    d.sinNumero ? `${nf(0).format(d.sinNumero)} sin número (#REF!, vacías o texto)` : "",
    d.fueraDeRango ? `${nf(0).format(d.fueraDeRango)} fuera de rango (${CONFIG_TIPO[tipo].rangoTexto})` : "",
    d.fechaInvalida ? `${nf(0).format(d.fechaInvalida)} con fecha inválida` : "",
  ].filter(Boolean);
  return `Se descartaron ${nf(0).format(total)} fila(s): ${partes.join(", ")}.`;
}

/** Primeras y últimas filas para la vista previa. */
export function extremos(datos: TuplaFecha[], n = 3): { primeras: TuplaFecha[]; ultimas: TuplaFecha[] } {
  return datos.length <= 2 * n ? { primeras: datos, ultimas: [] } : { primeras: datos.slice(0, n), ultimas: datos.slice(-n) };
}

export const fechaTexto = (f: string) => F.date(f);
