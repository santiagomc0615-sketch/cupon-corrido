/* Vista cliente (lib/cliente.ts): lee el motor y lib/carry, sin cálculos propios nuevos. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { calcularCarry } from "@/lib/carry/fondeo";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { tasaDiaria } from "@/lib/carry/tasas";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { resumenPortafolio, resumenTitulo } from "@/lib/cliente";
import { crearMotor, esError, toN, type Bono, type DatosMercado, type ResultadoValoracion } from "@/lib/engine";

const motor = crearMotor(datos as unknown as DatosMercado);
const D = crearDefaults("2026-11-04");
const valorar = (b: Bono): ResultadoValoracion => {
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return o;
};

describe("Vista cliente de un título", () => {
  const b = toEngine(D.TF);
  const o = valorar(b);
  const r = resumenTitulo(b, o);

  it("ganancia anual = giro × TIR y diaria = giro × ((1+TIR)^(1/365) − 1)", () => {
    expect(r.giro).toBe(o.giro);
    expect(r.gananciaAnual).toBeCloseTo(o.giro * o.irr, 4);
    expect(r.gananciaDiaria).toBeCloseTo(o.giro * tasaDiaria(o.irr), 6);
  });

  it("colchón = ganancia de un año / DV01 (igual que lib/carry con capital propio)", () => {
    const c = calcularCarry(posicionDesdeMotor(b, o), { tipo: "propio", haircut: 0 }, 0);
    expect(r.colchonPb).toBeCloseTo(c.horizontes[2].colchonPb, 9);
    expect(r.colchonPb).toBeCloseTo((o.giro * o.irr) / o.dv01, 6);
  });

  it("próximo cupón con lo causado como progreso del periodo", () => {
    expect(r.proximo?.fecha).toBe(o.proximo);
    expect(r.proximo?.progreso).toBeCloseTo(o.diasCorridos / o.diasPeriodo, 12);
    expect(r.proximo!.progreso).toBeGreaterThan(0);
    expect(r.proximo!.progreso).toBeLessThan(1);
  });

  it("los pagos son los flujos futuros en pesos del motor y el total los suma", () => {
    expect(r.pagos).toHaveLength(o.cashCOP.length);
    expect(r.totalPagos).toBeCloseTo(o.cashCOP.reduce((s, c) => s + c.cop, 0), 4);
    expect(r.pagos[0].fecha).toBe(o.proximo);
    expect(r.pagos[r.pagos.length - 1].fecha).toBe(b.vencimiento);
  });

  it("CDT al mismo plazo: misma fórmula con la tasa del CDT y días reales al vencimiento", () => {
    const dias = toN(b.vencimiento) - toN(b.valoracion);
    const c = r.comparar(0.1079);
    expect(c.plazoDias).toBe(dias);
    expect(c.cdt).toBeCloseTo(o.giro * (Math.pow(1.1079, dias / 365) - 1), 4);
    expect(c.bono).toBeCloseTo(o.giro * (Math.pow(1 + o.irr, dias / 365) - 1), 4);
    expect(c.ganaBono).toBe(o.irr > 0.1079);
    expect(r.comparar(o.irr + 0.01).ganaBono).toBe(false);
  });

  it("en UVR la ganancia usa la TIR en pesos y los pagos vienen en pesos", () => {
    const bu = toEngine(D.UVR);
    const ou = valorar(bu);
    const ru = resumenTitulo(bu, ou);
    expect(ru.tir).toBe(ou.yieldCOP);
    expect(ru.totalPagos).toBeCloseTo(ou.cashCOP.reduce((s, c) => s + c.cop, 0), 2);
  });
});

describe("Vista cliente del portafolio", () => {
  const pos = (["TF", "IBR", "IPC", "UVR"] as const).map((t) => {
    const b = toEngine(D[t]);
    return { b, o: valorar(b), titulo: String(D[t].nombre) };
  });
  const r = resumenPortafolio(pos)!;
  const uno = pos.map((x) => resumenTitulo(x.b, x.o));

  it("suma ganancias y giros; el colchón usa el DV01 total", () => {
    expect(r.giro).toBeCloseTo(uno.reduce((s, x) => s + x.giro, 0), 4);
    expect(r.gananciaAnual).toBeCloseTo(uno.reduce((s, x) => s + x.gananciaAnual, 0), 4);
    expect(r.gananciaDiaria).toBeCloseTo(uno.reduce((s, x) => s + x.gananciaDiaria, 0), 6);
    expect(r.colchonPb).toBeCloseTo(r.gananciaAnual / pos.reduce((s, x) => s + x.o.dv01, 0), 9);
  });

  it("el próximo cupón es el más cercano e indica el título", () => {
    const fechas = uno.map((x) => x.proximo!.fecha).sort();
    expect(r.proximo?.fecha).toBe(fechas[0]);
    expect(r.proximo?.titulo).toBeTruthy();
  });

  it("los pagos se agrupan por fecha sin perder pesos", () => {
    expect(r.totalPagos).toBeCloseTo(uno.reduce((s, x) => s + x.totalPagos, 0), 0); // al peso: sumar billones en otro orden mueve centavos
    const fechas = r.pagos.map((p) => p.fecha);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it("CDT: cada título a su propio plazo", () => {
    const c = r.comparar(0.1079);
    expect(c.cdt).toBeCloseTo(uno.reduce((s, x) => s + x.comparar(0.1079).cdt, 0), 4);
    expect(c.bono).toBeCloseTo(uno.reduce((s, x) => s + x.comparar(0.1079).bono, 0), 4);
  });

  it("sin posiciones no hay resumen", () => {
    expect(resumenPortafolio([])).toBeNull();
  });
});
