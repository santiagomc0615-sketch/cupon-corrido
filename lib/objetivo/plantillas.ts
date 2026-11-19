/* Preguntas rápidas del parcial sobre «Buscar objetivo». Cada plantilla arma el problema, lo resuelve,
   muestra las convenciones usadas y una tabla de sensibilidad de la respuesta a esas convenciones
   (base, modalidad del IPC, primer periodo del IBR y medición de la TIR). Funciones puras. */
import type { EntradasUI } from "@/lib/calculadora";
import { ID_CURVA_USUARIO } from "@/lib/cargas-usuario/datos";
import { F, nf } from "@/lib/format";
import { buscarObjetivo, evaluar, fmtValor, type ContextoObjetivo, type Problema, type Respuesta, type SinRespuesta } from "./objetivo";

export type ClavePlantilla = "ipcSpread" | "ibrSpread" | "tasaFija" | "precioMaximo" | "nominalGiro";

export const PLANTILLAS: { clave: ClavePlantilla; pregunta: string; ayuda: string }[] = [
  { clave: "ipcSpread", pregunta: "¿Qué spread sobre IPC necesito para rentar mínimo X % E.A.?", ayuda: "Título IPC a la par; proyecta el IPC con las expectativas cargadas." },
  { clave: "ibrSpread", pregunta: "¿Qué spread sobre IBR iguala un título tasa fija o un CDT al X % E.A.?", ayuda: "Título IBR a la par; proyecta el IBR con la curva FRAC cargada." },
  { clave: "tasaFija", pregunta: "¿Qué tasa fija equivale a un título IBR + s o IPC + s?", ayuda: "La TIR E.A. del título indexado comprado a la par." },
  { clave: "precioMaximo", pregunta: "¿Cuánto es lo máximo que debo pagar para rentar X %?", ayuda: "Precio sucio y valor de giro del título de la calculadora a esa TIR." },
  { clave: "nominalGiro", pregunta: "¿Qué nominal compro con un valor de giro de $X?", ayuda: "Con el precio del título de la calculadora." },
];

export const BASES = ["30/360", "Real/360", "Real/365", "365/365"] as const;
export const MODALIDADES = ["Inicio (Previo)", "Final (Actual)"] as const;

export interface DatosPlantilla {
  /** Emisión y compra (a la par) o fecha de compra. */
  fecha: string;
  vencimiento: string;
  frecuencia: string;
  base: string;
  /** IPC: modalidad del índice. */
  modalidad?: string;
  /** Objetivo (TIR en %, o valor de giro en pesos). */
  objetivo: number;
  /** Plantilla «tasa fija equivalente»: tipo y spread (%). */
  tipo?: "IBR" | "IPC";
  spread?: number;
  /** IBR: el periodo que empieza en la compra con la FRA y la TIR con días reales/365 (convención de clase). */
  convencionClase?: boolean;
  /** Plantillas d y e: el título de la calculadora. */
  titulo?: EntradasUI;
}

export interface Fuentes {
  /** «Curva FRAC: … · fecha» */
  frac: string;
  /** «Expectativas: … · fecha» */
  exp: string;
  /** Hay curva FRAC cargada por el usuario. */
  fracUsuario: boolean;
}

export interface Sensibilidad {
  columnas: string[];
  filas: { etiqueta: string; valores: (number | null)[]; actual?: boolean }[];
  unidad: "%" | "$";
}

export interface ResultadoPlantilla {
  respuesta: Respuesta | SinRespuesta;
  problema: Problema;
  /** Texto grande de la respuesta. */
  titular: string;
  /** Cifras adicionales (p. ej. precio y giro). */
  extras: [string, string][];
  convenciones: [string, string][];
  sensibilidad: Sensibilidad | null;
  notas: string[];
}

/* ---------- entradas ---------- */
function titulo(base: EntradasUI, d: DatosPlantilla, cambios: Partial<EntradasUI>): EntradasUI {
  return { ...base, emision: d.fecha, valoracion: d.fecha, vencimiento: d.vencimiento, frecuencia: d.frecuencia, base: d.base, ...cambios };
}
const ipc = (defs: Record<string, EntradasUI>, d: DatosPlantilla, extra: Partial<EntradasUI> = {}) =>
  titulo(defs.IPC, d, { modalidad: d.modalidad ?? "Inicio (Previo)", proyeccion: "Expectativas", corrido: "Lineal", ...extra });
const ibr = (defs: Record<string, EntradasUI>, d: DatosPlantilla, f: Fuentes, extra: Partial<EntradasUI> = {}) =>
  titulo(defs.IBR, d, { metodologia: "Curva FRAC", curvaFrac: f.fracUsuario ? ID_CURVA_USUARIO : "", descuento: "Encadenado por periodo", ...extra });

/** Valor (o null) del resultado al resolver con otras convenciones. */
const x = (ctx: ContextoObjetivo, p: Problema) => {
  const r = buscarObjetivo(ctx, p);
  return r.ok ? r.x : null;
};
const tir = (ctx: ContextoObjetivo, p: Problema, s: number) => {
  try {
    return evaluar(ctx, p, s).valor;
  } catch {
    return null;
  }
};

const fmtPct = (v: number, d = 3) => `${nf(d).format(v)} %`;
const nombreConvencion = (clase: boolean) =>
  clase ? "Primer periodo con la FRA de su inicio; TIR con días reales/365 (XIRR)" : "Periodo en curso con el IBR publicado; TIR con el tiempo en la base del título (motor = Excel)";

/* ---------- plantillas ---------- */
export function resolverPlantilla(clave: ClavePlantilla, ctx: ContextoObjetivo, defs: Record<string, EntradasUI>, d: DatosPlantilla, f: Fuentes): ResultadoPlantilla {
  switch (clave) {
    case "ipcSpread": {
      const p: Problema = { entradas: ipc(defs, d), resultado: "tir", objetivo: d.objetivo, variable: "spreadFacial", aLaPar: true };
      const r = buscarObjetivo(ctx, p);
      return {
        respuesta: r,
        problema: p,
        titular: r.ok ? `IPC + ${fmtPct(r.x)}` : "Sin solución",
        extras: r.ok ? [["TIR E.A. con ese spread", fmtPct(r.eval.valor)]] : [],
        convenciones: [
          ["Compra", `a la par (100) el ${F.date(d.fecha)}, emisión el mismo día`],
          ["Vencimiento", F.date(d.vencimiento)],
          ["Frecuencia", d.frecuencia],
          ["Base", d.base],
          ["Modalidad del IPC", d.modalidad ?? "Inicio (Previo)"],
          ["Proyección del IPC", `Expectativas · ${f.exp}`],
          ["TIR", "E.A. con el tiempo en la base del título (motor = Excel)"],
        ],
        sensibilidad: {
          columnas: [...MODALIDADES],
          unidad: "%",
          filas: BASES.map((base) => ({
            etiqueta: `Base ${base}`,
            actual: base === d.base,
            valores: MODALIDADES.map((m) => x(ctx, { ...p, entradas: ipc(defs, { ...d, base, modalidad: m }) })),
          })),
        },
        notas: ["Spread que, comprando a la par, hace que la TIR iguale el objetivo. Con un spread mayor la rentabilidad supera el mínimo."],
      };
    }
    case "ibrSpread": {
      const clase = d.convencionClase ?? true;
      const p: Problema = { entradas: ibr(defs, d, f), resultado: clase ? "tirXirr" : "tir", objetivo: d.objetivo, variable: "spreadFacial", aLaPar: true, primerPeriodoFRA: clase };
      const r = buscarObjetivo(ctx, p);
      const combos: [string, boolean, "tir" | "tirXirr"][] = [
        ["FRA + XIRR (clase)", true, "tirXirr"],
        ["FRA + base", true, "tir"],
        ["Publicado + XIRR", false, "tirXirr"],
        ["Publicado + base (motor)", false, "tir"],
      ];
      return {
        respuesta: r,
        problema: p,
        titular: r.ok ? `IBR + ${fmtPct(r.x)}` : "Sin solución",
        extras: r.ok ? [["TIR E.A. con ese spread", fmtPct(r.eval.valor)]] : [],
        convenciones: [
          ["Compra", `a la par (100) el ${F.date(d.fecha)}, emisión el mismo día`],
          ["Vencimiento", F.date(d.vencimiento)],
          ["Frecuencia", d.frecuencia],
          ["Base", d.base],
          ["Cupón", "(FRA del inicio del periodo + spread) × días/base"],
          ["Curva FRAC", f.frac],
          ["Convención", nombreConvencion(clase)],
        ],
        sensibilidad: {
          columnas: combos.map((c) => c[0]),
          unidad: "%",
          filas: BASES.map((base) => ({
            etiqueta: `Base ${base}`,
            actual: base === d.base,
            valores: combos.map(([, fra, res]) => x(ctx, { ...p, entradas: ibr(defs, { ...d, base }, f), resultado: res, primerPeriodoFRA: fra })),
          })),
        },
        notas: [
          "FRA: el periodo que empieza el día de la compra se proyecta con la FRA de esa fecha. Publicado: con el IBR publicado del día hábil anterior (así lo hace el Excel del curso).",
          "XIRR: la TIR descuenta con días reales/365. Base: con el tiempo en la base del título (días/360 o días/365), como el motor.",
        ],
      };
    }
    case "tasaFija": {
      const tipo = d.tipo ?? "IBR";
      const s = d.spread ?? 0;
      const clase = d.convencionClase ?? true;
      const entradas = tipo === "IPC" ? ipc(defs, d) : ibr(defs, d, f);
      const p: Problema = {
        entradas,
        resultado: tipo === "IBR" && clase ? "tirXirr" : "tir",
        objetivo: 0,
        variable: "spreadFacial",
        aLaPar: true,
        primerPeriodoFRA: tipo === "IBR" && clase,
      };
      const v = tir(ctx, p, s);
      const respuesta: Respuesta | SinRespuesta =
        v == null
          ? { ok: false, mensaje: "El motor no pudo valorar el título con esas entradas. Revise las fechas y los datos." }
          : buscarObjetivo(ctx, { ...p, objetivo: v });
      const columnas = tipo === "IPC" ? [...MODALIDADES] : ["FRA + XIRR (clase)", "Publicado + base (motor)"];
      return {
        respuesta,
        problema: { ...p, objetivo: v ?? 0 },
        titular: v == null ? "Sin solución" : `${fmtPct(v)} E.A.`,
        extras: [[`${tipo} + ${fmtPct(s)} a la par`, v == null ? "—" : `TIR ${fmtPct(v)} E.A.`]],
        convenciones: [
          ["Título", `${tipo} + ${fmtPct(s)}, a la par el ${F.date(d.fecha)}`],
          ["Vencimiento", F.date(d.vencimiento)],
          ["Frecuencia", d.frecuencia],
          ["Base", d.base],
          ...(tipo === "IPC"
            ? ([
                ["Modalidad del IPC", d.modalidad ?? "Inicio (Previo)"],
                ["Proyección del IPC", `Expectativas · ${f.exp}`],
              ] as [string, string][])
            : ([
                ["Curva FRAC", f.frac],
                ["Convención", nombreConvencion(clase)],
              ] as [string, string][])),
        ],
        sensibilidad: {
          columnas,
          unidad: "%",
          filas: BASES.map((base) => ({
            etiqueta: `Base ${base}`,
            actual: base === d.base,
            valores:
              tipo === "IPC"
                ? MODALIDADES.map((m) => tir(ctx, { ...p, entradas: ipc(defs, { ...d, base, modalidad: m }) }, s))
                : [true, false].map((c) => tir(ctx, { ...p, entradas: ibr(defs, { ...d, base }, f), resultado: c ? "tirXirr" : "tir", primerPeriodoFRA: c }, s)),
          })),
        },
        notas: ["Un título tasa fija comprado a la par con ese cupón E.A. tiene la misma TIR: esa es la tasa fija equivalente."],
      };
    }
    case "precioMaximo": {
      const t = d.titulo!;
      const variable = t.tipo === "TF" || t.tipo === "UVR" ? "tasaCompra" : "spreadCompra";
      const p: Problema = { entradas: t, resultado: "tir", objetivo: d.objetivo, variable };
      const r = buscarObjetivo(ctx, p);
      return {
        respuesta: r,
        problema: p,
        titular: r.ok ? `${nf(3).format(r.eval.o.dirty)} %` : "Sin solución",
        extras: r.ok
          ? [
              ["Valor de giro máximo", F.cop(r.eval.o.giro)],
              ["Precio limpio", `${nf(3).format(r.eval.o.clean)} %`],
              [variable === "tasaCompra" ? "Tasa de compra" : "Spread de compra", fmtPct(r.x)],
            ]
          : [],
        convenciones: [
          ["Título", String(t.nombre || `${t.tipo} ${t.vencimiento}`)],
          ["Compra", F.date(String(t.valoracion))],
          ["Frecuencia", String(t.frecuencia)],
          ["Base", String(t.base)],
          ["TIR", "E.A. del motor (tiempo en la base del título); precio truncado a 3 decimales"],
        ],
        sensibilidad: {
          columnas: ["Precio sucio", "Valor de giro"],
          unidad: "%",
          filas: BASES.map((base) => {
            const rr = buscarObjetivo(ctx, { ...p, entradas: { ...t, base } });
            return { etiqueta: `Base ${base}`, actual: base === t.base, valores: rr.ok ? [rr.eval.o.dirty, rr.eval.o.giro] : [null, null] };
          }),
        },
        notas: ["Pagando más que ese precio la TIR queda por debajo del objetivo."],
      };
    }
    case "nominalGiro": {
      const t = d.titulo!;
      const p: Problema = { entradas: t, resultado: "giro", objetivo: d.objetivo, variable: "nominal" };
      const r = buscarObjetivo(ctx, p);
      const multiplo = 1e6;
      const redondo = r.ok ? Math.floor(r.x / multiplo) * multiplo : 0;
      return {
        respuesta: r,
        problema: p,
        titular: r.ok ? F.cop(r.x) : "Sin solución",
        extras: r.ok
          ? [
              ["Precio sucio usado", `${nf(3).format(r.eval.o.dirty)} %`],
              ["En múltiplos de $ 1.000.000", `${F.cop(redondo)} (giro ${F.cop(((r.eval.o.giro / r.x) * redondo) as number)})`],
            ]
          : [],
        convenciones: [
          ["Título", String(t.nombre || `${t.tipo} ${t.vencimiento}`)],
          ["Compra", F.date(String(t.valoracion))],
          ["Base", String(t.base)],
          ["Giro", t.tipo === "UVR" ? "precio sucio × nominal en UVR × UVR del día" : "precio sucio × nominal"],
        ],
        sensibilidad: {
          columnas: ["Nominal"],
          unidad: "$",
          filas: BASES.map((base) => {
            const rr = buscarObjetivo(ctx, { ...p, entradas: { ...t, base } });
            return { etiqueta: `Base ${base}`, actual: base === t.base, valores: [rr.ok ? rr.x : null] };
          }),
        },
        notas: [],
      };
    }
  }
}

export const fmtCelda = (v: number | null, u: "%" | "$", col?: string) => (v == null ? "—" : col === "Valor de giro" ? F.cop(v) : fmtValor(v, u));
