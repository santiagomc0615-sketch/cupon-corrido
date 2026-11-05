/* Inflación implícita (breakeven) y carga de la curva TES UVR. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { curvaBreakeven } from "@/lib/breakeven";
import { detectarCSV, detectarHoja } from "@/lib/cargas/leer";
import { INDICE_VACIO } from "@/lib/cargas/tipos";
import { validarCarga } from "@/lib/cargas/validar";
import { combinar } from "@/lib/data/combinar";
import { curvaCero, plazoTES, type DatosMercado, type TuplaTES } from "@/lib/engine";

const D = datos as unknown as DatosMercado;
const FECHA = "2026-10-16";
const refs = (tir: number): TuplaTES[] =>
  ["2028-10-16", "2031-10-16", "2036-10-16", "2046-10-16"].map((v, i) => [`TES UVR ${i}`, v, tir, tir, plazoTES(FECHA, v)]);

describe("Breakeven", () => {
  it("sin curva UVR no hay breakeven", () => {
    expect(curvaBreakeven(D)).toBeNull();
  });

  it("con curvas planas cumple la relación de Fisher en todos los plazos", () => {
    const nominal = curvaCero(refs(0.12)),
      real = curvaCero(refs(0.05));
    const be = curvaBreakeven({ zero: nominal, curveDate: FECHA, curvaUVR: { fecha: FECHA, tes: refs(0.05), zero: real } })!;
    const fisher = 1.12 / 1.05 - 1;
    expect(be.puntos.length).toBeGreaterThan(10);
    for (const p of be.puntos) {
      expect(p.breakeven).toBeCloseTo(fisher, 12);
      if (p.forward != null) expect(p.forward).toBeCloseTo(fisher, 10);
    }
    expect(be.desfaseDias).toBe(0);
    // no extrapola más allá de la referencia UVR más larga (20 años)
    expect(Math.max(...be.puntos.map((p) => p.t))).toBeLessThanOrEqual(20);
  });

  it("con la curva TF del Excel y una curva real, el breakeven sube si la real baja", () => {
    const alto = curvaBreakeven({ ...D, curvaUVR: { fecha: FECHA, tes: refs(0.04), zero: curvaCero(refs(0.04)) } })!;
    const bajo = curvaBreakeven({ ...D, curvaUVR: { fecha: FECHA, tes: refs(0.06), zero: curvaCero(refs(0.06)) } })!;
    expect(alto.be(5)).toBeGreaterThan(bajo.be(5));
  });
});

describe("Carga de la curva TES UVR", () => {
  it("una hoja de referencias con UVR en el título se reconoce como curva real", () => {
    const d = detectarHoja({
      hoja: "Curva_UVR",
      filas: [
        ["CURVA DE RENDIMIENTOS – TES UVR"],
        [],
        ["Fecha de la curva", "2026-10-16"],
        ["Título", "Emisión", "Vencimiento", "Cupón", "TIR mercado (E.A.)"],
        ["TES UVR 2029", "2018-04-18", "2029-04-18", 0.0225, 0.0511],
        ["TES UVR 2035", "2020-03-25", "2035-03-25", 0.035, 0.0545],
      ],
    });
    expect(d.tipo).toBe("tesuvr");
    if (d.tipo !== "tesuvr") return;
    expect(d.fecha).toBe("2026-10-16");
    expect(d.refs).toEqual([
      ["TES UVR 2029", "2029-04-18", 0.0225, 0.0511],
      ["TES UVR 2035", "2035-03-25", 0.035, 0.0545],
    ]);
    expect(validarCarga({ tipo: "tesuvr", origen: "x", cargada: "", fecha: d.fecha, refs: d.refs })).toEqual([]);
  });

  it("CSV de TES UVR con valores en %", () => {
    const d = detectarCSV("uvr.csv", "titulo;vencimiento;cupon;tir\nTES UVR 2029;18/04/2029;2,25;5,11\n", "tesuvr", "2026-10-16");
    expect(d.tipo).toBe("tesuvr");
    if (d.tipo === "tesuvr") expect(d.refs[0][3]).toBeCloseTo(0.0511, 12);
  });

  it("combinar arma la curva real y la marca como cargada", () => {
    const { datos: dm, fuentes } = combinar(D, { errores: {} }, {
      indice: INDICE_VACIO,
      series: {},
      tesuvr: { tipo: "tesuvr", origen: "uvr.xlsx · Curva_UVR", cargada: "", fecha: FECHA, refs: refs(0.05).map(([t, v, c, r]) => [t, v, c, r]) },
    });
    expect(dm.curvaUVR?.zero.length).toBe(33);
    expect(fuentes.tesuvr?.estado).toBe("cargado");
    expect(curvaBreakeven(dm)).not.toBeNull();
  });
});
