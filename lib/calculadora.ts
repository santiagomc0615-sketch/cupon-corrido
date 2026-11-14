/* Configuración del formulario de la calculadora y conversión de entradas de la interfaz
   (tasas en %) a entradas del motor (tasas en fracción). */
import type { Bono, TipoBono } from "@/lib/engine";

/** Valores tal como los escribe el usuario: tasas en %, números vacíos como "". */
export type EntradasUI = { tipo: TipoBono; nombre: string } & Record<string, string | number>;

/** Títulos de ejemplo (los del Excel del curso) valorados en la fecha de análisis. */
export function crearDefaults(fecha: string): Record<TipoBono, EntradasUI> {
  return {
    TF: { tipo: "TF", nombre: "TES TF ejemplo 2031", nominal: 1e10, emision: "2026-10-20", vencimiento: "2031-10-20", cupon: 13.85, frecuencia: "Trimestral", base: "365/365", valoracion: fecha, tasaCompra: 13.6, tasaVenta: 11.5, corrido: "Lineal" },
    IBR: { tipo: "IBR", nombre: "Bono IBR+1,80 2028", nominal: 5e9, emision: "2025-09-15", vencimiento: "2028-09-15", spread: 1.8, frecuencia: "Trimestral", base: "30/360", valoracion: fecha, spreadCompra: 1.7, spreadVenta: 1.9, metodologia: "IBR vigente", descuento: "TIR con IBR promedio", precioDado: "", curvaFrac: "" },
    IPC: { tipo: "IPC", nombre: "Bono IPC+7,98 2036", nominal: 1e10, emision: "2026-10-20", vencimiento: "2036-10-20", spread: 7.98, frecuencia: "Trimestral", base: "365/365", valoracion: fecha, spreadCompra: 7.5, spreadVenta: 6, modalidad: "Inicio (Previo)", proyeccion: "IPC vigente", corrido: "Lineal" },
    UVR: { tipo: "UVR", nombre: "TES UVR 2029", nominal: 1e10, emision: "2025-04-18", vencimiento: "2029-04-18", cupon: 2.25, frecuencia: "Anual", base: "365/365", valoracion: fecha, tasaCompra: 5.11, tasaVenta: 5.21, corrido: "Lineal", proyeccion: "IPC vigente" },
  };
}

export const PCT_KEYS = ["cupon", "tasaCompra", "tasaVenta", "spread", "spreadCompra", "spreadVenta"];

export const OPTS: Record<string, string[]> = {
  frecuencia: ["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"],
  base: ["365/365", "Real/365", "30/360", "Real/360"],
  corrido: ["Lineal", "Compuesto"],
  metodologia: ["IBR vigente", "Curva FRAC"],
  descuento: ["TIR con IBR promedio", "Encadenado por periodo"],
  modalidad: ["Inicio (Previo)", "Final (Actual)"],
  proyeccion: ["IPC vigente", "Expectativas"],
};

/** [clave, etiqueta, tipo de campo, ancho completo "w", unidad] */
export type Campo = [string, string, "text" | "num" | "pct" | "date" | "sel", ("w" | "")?, string?];

export const LAYOUT: { common1: Campo[] } & Record<TipoBono, { faciales: Campo[]; neg: Campo[] }> = {
  common1: [["nombre", "Nombre del título", "text", "w"], ["nominal", "Valor nominal", "num", "w"], ["emision", "Emisión", "date"], ["vencimiento", "Vencimiento", "date"], ["frecuencia", "Frecuencia del cupón", "sel"], ["base", "Base de intereses", "sel"]],
  TF: { faciales: [["cupon", "Cupón facial", "pct", "w", "E.A."]], neg: [["tasaCompra", "Tasa compra (offer)", "pct", "", "E.A."], ["tasaVenta", "Tasa venta (bid)", "pct", "", "E.A."], ["corrido", "Cupón corrido", "sel", "w"]] },
  IBR: { faciales: [["spread", "Spread facial sobre IBR", "pct", "w", "N.A."]], neg: [["spreadCompra", "Spread compra", "pct", "", "IBR+"], ["spreadVenta", "Spread venta", "pct", "", "IBR+"], ["metodologia", "Proyección del IBR", "sel"], ["descuento", "Método de descuento", "sel"], ["precioDado", "Precio sucio dado (opcional)", "num", "w", "%"]] },
  IPC: { faciales: [["spread", "Spread facial sobre IPC", "pct", "w", "E.A."]], neg: [["spreadCompra", "Spread compra", "pct", "", "IPC+"], ["spreadVenta", "Spread venta", "pct", "", "IPC+"], ["modalidad", "Modalidad del IPC", "sel"], ["proyeccion", "Proyección del IPC", "sel"], ["corrido", "Cupón corrido", "sel", "w"]] },
  UVR: { faciales: [["cupon", "Cupón facial real", "pct", "w", "E.A."]], neg: [["tasaCompra", "Tasa compra (offer)", "pct", "", "real"], ["tasaVenta", "Tasa venta (bid)", "pct", "", "real"], ["proyeccion", "Inflación para proyectar UVR", "sel"], ["corrido", "Cupón corrido", "sel"]] },
};

/** Entradas de la interfaz → entradas del motor. */
export function toEngine(inp: EntradasUI): Bono {
  const b: Record<string, unknown> = { ...inp };
  PCT_KEYS.forEach((k) => {
    if (k in b) b[k] = (+(b[k] as number) || 0) / 100;
  });
  b.nominal = +(b.nominal as number) || 0;
  b.precioDado = +(b.precioDado as number) || 0;
  if (!b.curvaFrac) delete b.curvaFrac;
  return b as unknown as Bono;
}

export type ModoVenta = "tasa" | "curva";

export interface EstadoCalculadora {
  type: TipoBono;
  inputs: Record<TipoBono, EntradasUI>;
  /** Simulación de venta anticipada: fecha, tasa (%), modo y, para IBR con curva, spread (%) y curva. */
  hv?: { d: string; r: number; modo?: ModoVenta; spread?: number; curva?: string };
}

/* ---------- Portafolio ---------- */
export interface Posicion {
  id: string;
  ejemplo?: boolean;
  inputs: EntradasUI;
}

export function crearPfEjemplo(d: Record<TipoBono, EntradasUI>): Posicion[] {
  return [
    { id: "p1", ejemplo: true, inputs: { ...d.TF, nombre: "TES TF 2031 (ejemplo)", nominal: 4e9 } },
    { id: "p2", ejemplo: true, inputs: { ...d.IBR, nombre: "Bono IBR+1,80 2028 (ejemplo)", nominal: 3e9 } },
    { id: "p3", ejemplo: true, inputs: { ...d.IPC, nombre: "Bono IPC+7,98 2036 (ejemplo)", nominal: 2e9 } },
    { id: "p4", ejemplo: true, inputs: { ...d.UVR, nombre: "TES UVR 2029 (ejemplo)", nominal: 5e6 } },
  ];
}

export const TYPE_LBL: Record<TipoBono, string> = { TF: "Tasa fija", IBR: "IBR", IPC: "IPC", UVR: "UVR" };
export const TYPE_CLR: Record<TipoBono, string> = { TF: "var(--engrave)", IBR: "var(--seal-texto)", IPC: "var(--neg)", UVR: "var(--ink-3)" };
