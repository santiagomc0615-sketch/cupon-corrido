/* Encuesta Mensual de Expectativas del BanRep (EME) subida tal como se descarga.
   Filas tomadas del archivo publicado res_inf_oct2024.xlsx (hoja INFLACION TOT, recortada). */
import { describe, expect, it } from "vitest";
import { leerEncuestaBanRep, mesHorizonte } from "@/lib/cargas/encuesta-banrep";
import { detectarHojas } from "@/lib/cargas/leer";
import { validarCarga } from "@/lib/cargas/validar";

const TOT = [
  ["RESULTADOS DE LA ENCUESTA MENSUAL DE EXPECTATIVAS ECONOMICAS", null, null, null, null, null, null],
  ["Fecha de realización: del 8 de octubre al 10 de octubre de 2024", null, null, null, null, null, null],
  ["Nota: la inflación mensual y anual observada en octubre de 2023 fue de 0.25% y 10.48% respectivamente.", null, null, null, null, null, null],
  [null, "Expectativas sobre la variación del índice de precios al consumidor (IPC) total", null, null, null, null, null],
  ["Medidas estadísticas", "% mensual en oct./2024", "% Anual en dic/2024", "%Anual en oct./2025", "% Anual en dic/2025", "%Anual en oct./2026", "%Anual en oct./2029"],
  ["Medidas estadísticas", null, null, null, null, null, null],
  ["De tendencia:", null, null, null, null, null, null],
  ["Media", 0.00171876, 0.05468537, 0.04129203, 0.03886585, 0.03440175, 0.03268649],
  ["Mediana", 0.0017, 0.055, 0.04055, 0.0382, 0.0345, 0.03],
  ["Moda", 0.0017, null, null, null, 0.03, 0.03],
  ["BANCOS", null, null, null, null, null, null],
  ["Mediana", 0.0017, 0.05485, 0.04075, 0.03875, 0.0341, 0.03],
];
const SIN = [TOT[0], TOT[1], ["Nota: la inflación sin alimentos…"], [null, "Expectativas sobre la variación del IPC sin alimentos"], TOT[4], TOT[8]];

describe("Encuesta de expectativas del BanRep", () => {
  it("reconoce los horizontes de las columnas", () => {
    expect(mesHorizonte("% Anual en dic/2024")).toBe("2024-12-01");
    expect(mesHorizonte("%Anual en oct./2025")).toBe("2025-10-01");
    expect(mesHorizonte("% Anual en sept./2026")).toBe("2026-09-01");
    expect(mesHorizonte("% mensual en oct./2024")).toBeNull(); // la variación mensual no se usa
  });

  it("toma la mediana de todas las entidades (no la de bancos) y la interpola mes a mes", () => {
    const e = leerEncuestaBanRep(TOT);
    expect(e.horizontes).toEqual([
      ["2024-12-01", 0.055],
      ["2025-10-01", 0.04055],
      ["2025-12-01", 0.0382],
      ["2026-10-01", 0.0345],
      ["2029-10-01", 0.03],
    ]);
    expect(e.datos[0]).toEqual(["2024-12-01", 0.055]);
    expect(e.datos[e.datos.length - 1]).toEqual(["2029-10-01", 0.03]);
    expect(e.datos).toHaveLength(59); // dic-2024 a oct-2029, un dato por mes
    const nov25 = e.datos.find((r) => r[0] === "2025-11-01")![1];
    expect(nov25).toBeGreaterThan(0.0382);
    expect(nov25).toBeLessThan(0.04055);
    expect(e.realizacion).toContain("octubre de 2024");
  });

  it("al subir el archivo: inflación total como expectativas; las demás hojas se omiten con motivo", () => {
    const r = detectarHojas([
      { hoja: "INFLACION TOT", filas: TOT },
      { hoja: "INFLACION SIN", filas: SIN },
      { hoja: "TRM", filas: [TOT[0], ["Expectativas sobre la tasa de cambio"]] },
    ]);
    expect(r.map((d) => d.tipo)).toEqual(["exp", "ignorada", "ignorada"]);
    const exp = r[0];
    if (exp.tipo !== "exp") throw new Error("esperaba expectativas");
    expect(validarCarga({ tipo: "exp", origen: "res_inf_oct2024.xlsx · INFLACION TOT", cargada: "", datos: exp.datos })).toEqual([]);
    expect(r[1].tipo === "ignorada" && r[1].motivo).toMatch(/INFLACION TOT/);
  });

  it("explica si el archivo no trae la mediana", () => {
    expect(() => leerEncuestaBanRep(TOT.filter((f) => f[0] !== "Mediana"))).toThrow(/Mediana/);
  });
});
