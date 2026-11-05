/* Lector de archivos de /datos: el Excel del curso (varias hojas) y CSV. */
import { fileURLToPath } from "node:url";
import readXlsxFile from "read-excel-file/node";
import { beforeAll, describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { detectarCSV, detectarHojas, fechaCelda, numeroCelda, type Detectada, type HojaLeida } from "@/lib/cargas/leer";
import { validarCarga } from "@/lib/cargas/validar";
import { curvaCero, plazoTES, type DatosMercado, type TuplaTES } from "@/lib/engine";

const D = datos as unknown as DatosMercado;
const EXCEL = fileURLToPath(new URL("../excel/Calculadora_para_pagina.xlsx", import.meta.url));

let det: Detectada[] = [];
beforeAll(async () => {
  const hojas = await readXlsxFile(EXCEL);
  det = detectarHojas(hojas.map((h): HojaLeida => ({ hoja: h.sheet, filas: h.data as HojaLeida["filas"] })));
}, 60_000);

const de = <T extends Detectada["tipo"]>(tipo: T) => det.filter((d) => d.tipo === tipo) as Extract<Detectada, { tipo: T }>[];
/** Series de fecha y valor (exp, ipc, ibr12). */
const serie = (tipo: "exp" | "ipc" | "ibr12") => det.filter((d) => d.tipo === tipo) as { datos: [string, number][] }[];

describe("Excel del curso (todas las hojas)", () => {
  it("encuentra las dos curvas FRAC y sugiere compra y venta", () => {
    const fracs = de("frac");
    expect(fracs.map((f) => f.hoja).sort()).toEqual(["Curva_FRAC", "Curva_FRAC_Venta"]);
    expect(fracs.find((f) => f.hoja === "Curva_FRAC")!.sugerido).toBe("Compra");
    expect(fracs.find((f) => f.hoja === "Curva_FRAC_Venta")!.sugerido).toBe("Venta");
  });

  it("la curva FRAC leída es diaria y contiene todos los puntos del respaldo (que viene muestreado)", () => {
    const c = de("frac").find((f) => f.hoja === "Curva_FRAC")!;
    expect(c.datos.length).toBeGreaterThan(D.frac.length);
    const m = new Map(c.datos);
    for (const [f, v] of D.frac) expect(m.get(f)).toBe(v);
  });

  it("corrige y avisa las filas sueltas en % de la hoja Curva_FRAC", () => {
    const c = de("frac").find((f) => f.hoja === "Curva_FRAC")!;
    expect(c.datos.every(([, v]) => v < 1)).toBe(true);
    expect(c.avisos.join(" ")).toMatch(/venían en %/);
  });

  it("las curvas FRAC pasan la validación para guardarse", () => {
    for (const c of de("frac")) {
      const problemas = validarCarga({ tipo: "frac", id: "frac-prueba-1", nombre: c.hoja, fechaBase: c.datos[0][0], filas: c.datos.length, origen: c.hoja, cargada: "", datos: c.datos });
      expect(problemas, c.hoja).toEqual([]);
    }
  });

  it("lee expectativas, IPC e IBR 12 meses en las unidades del motor", () => {
    const exp = serie("exp")[0];
    expect(exp.datos).toEqual(D.exp);
    const ipc = serie("ipc")[0];
    const sep2026 = ipc.datos.find(([f]) => f.startsWith("2026-09"));
    const resp = D.ipc.find(([f]) => f.startsWith("2026-09"));
    expect(sep2026?.[1]).toBeCloseTo(resp![1], 10);
    const ibr12 = serie("ibr12")[0];
    const ult = D.ibr[D.ibr.length - 1];
    expect(ibr12.datos.find(([f]) => f === ult[0])?.[1]).toBeCloseTo(ult[5] / 100, 12);
  });

  it("lee las referencias TES y la curva cero calculada coincide con la del Excel", () => {
    const tes = det.find((d) => d.tipo === "tes") as { fecha: string; refs: [string, string, number, number][] };
    expect(tes.fecha).toBe(D.curveDate);
    expect(tes.refs.length).toBe(D.tes.length);
    const tuplas: TuplaTES[] = tes.refs.map(([t, v, c, r]) => [t, v, c, r, plazoTES(tes.fecha, v)]);
    curvaCero(tuplas).forEach(([, r], i) => expect(Math.abs(r - D.zero[i][1])).toBeLessThan(1e-12));
  });

  it("ignora las hojas de cálculo y la UVR (que llega en vivo)", () => {
    const ignoradas = de("ignorada").map((d) => d.hoja);
    expect(ignoradas).toContain("Calculadora_TF");
    expect(ignoradas).toContain("Datos_UVR");
  });
});

describe("CSV y celdas", () => {
  it("reconoce fechas en varios formatos", () => {
    expect(fechaCelda("2026-11-05")).toBe("2026-11-05");
    expect(fechaCelda("05/11/2026")).toBe("2026-11-05");
    expect(fechaCelda(46331)).toBe("2026-11-05");
    expect(fechaCelda(new Date(Date.UTC(2026, 10, 5)))).toBe("2026-11-05");
    expect(fechaCelda("31/02/2026")).toBeNull();
  });

  it("lee números con coma decimal", () => {
    expect(numeroCelda("11,26")).toBe(11.26);
    expect(numeroCelda("1.234,5")).toBe(1234.5);
    expect(numeroCelda("0.1126", false)).toBe(0.1126);
  });

  it("CSV de curva FRAC con punto y coma, coma decimal y valores en %", () => {
    const d = detectarCSV("frac_venta.csv", "Fecha;IBR forward\n05/11/2026;11,26\n06/11/2026;11,27\n", "frac");
    expect(d.tipo).toBe("frac");
    if (d.tipo !== "frac") return;
    expect(d.datos.map(([f]) => f)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(d.datos[0][1]).toBeCloseTo(0.1126, 12);
    expect(d.datos[1][1]).toBeCloseTo(0.1127, 12);
    expect(d.sugerido).toBe("Venta");
    expect(d.avisos.join(" ")).toMatch(/fracción/);
  });

  it("la validación rechaza fechas desordenadas y valores fuera de rango", () => {
    const p = validarCarga({ tipo: "exp", origen: "x", cargada: "", datos: [["2026-02-01", 0.05], ["2026-01-01", 5]] });
    expect(p.some((x) => /orden ascendente/.test(x))).toBe(true);
    expect(p.some((x) => /fuera de rango/.test(x))).toBe(true);
  });
});
