/* Carry y fondeo (lib/carry/). Caso de referencia: nominal 10.000 M, sucio 101,355 %, TIR 13,60 %,
   fondeo 12,25 % E.A., haircut 10 %, DV01 3.301.416. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { carryPortafolioFondeo, comparacion, CONFIG_INICIAL, tasaEfectiva, type ConfigFondeo } from "@/lib/carry/config";
import { compararExterior, costoEnPesos, devEquilibrio, tasaUSD } from "@/lib/carry/exterior";
import { calcularCarry, montos, tasaFondeoEA } from "@/lib/carry/fondeo";
import { causacionDiaria, posicionDesdeMotor } from "@/lib/carry/posicion";
import { eaDesdeNominal, eaDesdeOvernight360, tasaDiaria } from "@/lib/carry/tasas";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { crearMotor, esError, type BonoTF, type DatosMercado } from "@/lib/engine";

const M = 1e6;
const CASO = { giro: 1e10 * 1.01355, tir: 0.136, dv01: 3_301_416 };
const REPO = { tipo: "repo" as const, haircut: 0.1 };

describe("Caso de referencia", () => {
  const r = calcularCarry(CASO, REPO, 0.1225);

  it("causación diaria ≈ 3,5415 M", () => {
    expect(r.causacionDia.cop / M).toBeCloseTo(3.5415, 3);
    expect(r.causacionDia.pct).toBeCloseTo(tasaDiaria(0.136), 15);
    expect(causacionDiaria(CASO).cop).toBe(r.causacionDia.cop);
  });

  it("monto fondeado = giro × (1 − haircut) y costo diario ≈ 2,8885 M", () => {
    expect(r.fondeado).toBeCloseTo(9_121_950_000, 2);
    expect(r.capital).toBeCloseTo(1_013_550_000, 2);
    expect(r.pctFondeado).toBeCloseTo(0.9, 12);
    expect(r.costoDia.cop / M).toBeCloseTo(2.8885, 3);
  });

  it("carry neto ≈ 0,6530 M/día", () => {
    expect(r.carryDia / M).toBeCloseTo(0.653, 3);
  });

  it("a 365 días: carry ≈ 261 M, ROE ≈ 25,75 %, colchón ≈ 79 pb", () => {
    const anual = r.horizontes.find((h) => h.dias === 365)!;
    expect(anual.carry / M).toBeCloseTo(261, 0);
    expect(anual.roe).toBeCloseTo(0.2575, 3);
    expect(anual.roeEA).toBeCloseTo(anual.roe, 12);
    expect(anual.colchonPb).toBeCloseTo(79, 0);
  });

  it("horizontes de 30 y 90 días crecen con el plazo", () => {
    const [h30, h90, h365] = r.horizontes;
    expect([h30.dias, h90.dias, h365.dias]).toEqual([30, 90, 365]);
    expect(h30.carry).toBeLessThan(h90.carry);
    expect(h90.carry).toBeLessThan(h365.carry);
    expect(h30.colchonPb).toBeCloseTo(h30.carry / CASO.dv01, 12);
  });
});

describe("Tasas y tipos de fondeo", () => {
  it("convierte N.A. a E.A.", () => {
    expect(eaDesdeNominal(0.12, 4)).toBeCloseTo(Math.pow(1.03, 4) - 1, 15);
    expect(tasaFondeoEA({ tipo: "ibr", tasa: 0.12, modalidad: "NA", capitalizacion: "trimestral" })).toBeCloseTo(0.125509, 6);
    expect(tasaFondeoEA({ tipo: "credito", tasa: 0.14, modalidad: "EA", capitalizacion: "mensual" })).toBe(0.14);
  });

  it("capital propio: no hay fondeo, el carry es la causación y el ROE es sobre todo el giro", () => {
    expect(montos(CASO.giro, { tipo: "propio", haircut: 0.1 })).toEqual({ fondeado: 0, capital: CASO.giro });
    const r = calcularCarry(CASO, { tipo: "propio", haircut: 0.1 }, tasaFondeoEA({ tipo: "propio", tasa: 0.2, modalidad: "EA", capitalizacion: "diaria" }));
    expect(r.costoDia.cop).toBe(0);
    expect(r.horizontes[2].roe).toBeCloseTo(0.136, 12);
  });
});

describe("Fondeo en el exterior", () => {
  const base = { sofr: 0.0389, spread: 0.015, tasaCOP: 0.1225, devEsperada: 0.03, spot: 4000, plazoDias: 90 };

  it("tasa USD = SOFR + spread con base 360 llevada a E.A.", () => {
    expect(tasaUSD(0.0389, 0.015)).toBeCloseTo(eaDesdeOvernight360(0.0539), 15);
    expect(tasaUSD(0.0389, 0.015)).toBeGreaterThan(0.0539);
  });

  it("sin puntos forward, la paridad cubierta deja el costo cubierto igual a la tasa en pesos", () => {
    const c = compararExterior(9e9, base);
    const cub = c.filas.find((f) => f.alternativa === "cubierto")!;
    expect(c.origenForward).toBe("paridad");
    expect(cub.tasaEA).toBeCloseTo(0.1225, 12);
    expect(c.devForward).toBeCloseTo(c.devEquilibrio, 12);
  });

  it("devaluación de equilibrio: sin cubrir con esa devaluación cuesta lo mismo que en pesos", () => {
    const t = tasaUSD(base.sofr, base.spread);
    const dEq = devEquilibrio(base.tasaCOP, t);
    expect(dEq).toBeCloseTo((1 + 0.1225) / (1 + t) - 1, 15);
    expect(costoEnPesos(t, dEq)).toBeCloseTo(0.1225, 12);
  });

  it("con devaluación esperada baja, sin cubrir es lo más barato; con puntos caros, el forward encarece", () => {
    const c = compararExterior(9e9, base);
    expect(c.masBarata).toBe("sinCubrir");
    const caro = compararExterior(9e9, { ...base, devEsperada: 0.15, puntosForward: 200 });
    expect(caro.origenForward).toBe("puntos");
    expect(caro.forward).toBe(4200);
    expect(caro.devForward).toBeCloseTo(Math.pow(1.05, 365 / 90) - 1, 12);
    expect(caro.masBarata).toBe("local");
  });

  it("la configuración usa la SOFR en vivo salvo que se ingrese otra, y la cobertura elegida", () => {
    const c: ConfigFondeo = { ...CONFIG_INICIAL, tipo: "exterior", exterior: { ...CONFIG_INICIAL.exterior, tasaCOP: 0.1225 } };
    expect(tasaEfectiva(c, { sofr: null, spot: 4000 })).toBeNull(); // sin SOFR no se inventa
    expect(tasaEfectiva(c, { sofr: 0.0389, spot: 4000 })).toBeCloseTo(0.1225, 12); // cubierto por paridad
    const sin = { ...c, exterior: { ...c.exterior, cobertura: "sinCubrir" as const, sofr: 0.05 } };
    expect(tasaEfectiva(sin, { sofr: 0.0389, spot: 4000 })).toBeCloseTo(costoEnPesos(tasaUSD(0.05, 0.015), 0.03), 12);
    expect(comparacion(CONFIG_INICIAL, { sofr: 0.0389, spot: 4000 }, 1)?.filas[0].tasaEA).toBe(0.1225);
  });
});

describe("Con salidas reales del motor", () => {
  const motor = crearMotor(datos as unknown as DatosMercado);
  const tf: BonoTF = { tipo: "TF", nominal: 1e10, emision: "2026-10-20", vencimiento: "2031-10-20", cupon: 0.1385, frecuencia: "Trimestral", base: "365/365", valoracion: "2026-11-04", tasaCompra: 0.136, tasaVenta: 0.115, corrido: "Lineal" };

  it("lee giro, TIR, DV01 y el cupón vigente sin tocar el motor", () => {
    const o = motor.price(tf);
    if (esError(o)) throw new Error(o.error);
    const p = posicionDesdeMotor(tf, o);
    expect(p.giro).toBe(o.giro);
    expect(p.tir).toBe(o.irr);
    expect(p.dv01).toBe(o.dv01);
    expect(p.proximoCupon?.fecha).toBe(o.proximo);
    expect(p.proximoCupon?.dias).toBeGreaterThan(0);
    expect(p.proximoCupon?.cop).toBeCloseTo((p.proximoCupon!.pct / 100) * 1e10, 4);
    expect(p.proximoCupon?.causadoCop).toBe(o.corridoCOP);
  });

  it("en UVR causa con la TIR en pesos y pasa el cupón a pesos con la UVR", () => {
    const uvr = toEngine(crearDefaults("2026-11-04").UVR); // el título UVR de ejemplo de la calculadora
    const o = motor.price(uvr);
    if (esError(o)) throw new Error(o.error);
    expect(o.tipo).toBe("UVR");
    const p = posicionDesdeMotor(uvr, o);
    expect(p.fx).toBe(o.fx);
    expect(p.fx).toBeGreaterThan(100); // UVR en pesos
    expect(p.tir).toBe(o.yieldCOP);
    expect(p.proximoCupon?.cop).toBeCloseTo((p.proximoCupon!.pct / 100) * uvr.nominal * o.fx, 4);
  });

  it("portafolio: suma posiciones y calcula % fondeado y costo total", () => {
    const t = carryPortafolioFondeo([CASO, { ...CASO, giro: CASO.giro / 2, dv01: CASO.dv01 / 2 }], CONFIG_INICIAL, { sofr: null, spot: null })!;
    const uno = calcularCarry(CASO, REPO, 0.1225);
    expect(t.pctFondeado).toBeCloseTo(0.9, 12);
    expect(t.carryDia).toBeCloseTo(uno.carryDia * 1.5, 6);
    expect(t.costoDia).toBeCloseTo(uno.costoDia.cop * 1.5, 6);
    expect(t.horizontes[2].colchonPb).toBeCloseTo(uno.horizontes[2].colchonPb, 9);
  });
});
