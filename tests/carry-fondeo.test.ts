/* Carry y fondeo (lib/carry/). Caso de referencia: nominal 10.000 M, sucio 101,355 %, TIR 13,60 %,
   fondeo 12,25 % E.A., haircut 10 %, DV01 3.301.416. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import {
  carryPortafolioFondeo,
  comparacion,
  CONFIG_INICIAL,
  devUltimos12m,
  faltante,
  ibrEA,
  ibrParaPlazo,
  tasaCOPMercado,
  tasaEfectiva,
  tasaLocalEA,
  type ConfigFondeo,
  type MercadoFondeo,
} from "@/lib/carry/config";
import { compararExterior, costoEnPesos, devEquilibrio, devParidad, tasaUSD } from "@/lib/carry/exterior";
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
  const base = { sofr: 0.0389, spread: 0.015, tasaCOP: 0.1225, tasaCOPMercado: 0.11, devEsperada: 0.03, spot: 4000, plazoDias: 90 };

  it("tasa USD = SOFR + spread con base 360 llevada a E.A.", () => {
    expect(tasaUSD(0.0389, 0.015)).toBeCloseTo(eaDesdeOvernight360(0.0539), 15);
    expect(tasaUSD(0.0389, 0.015)).toBeGreaterThan(0.0539);
  });

  it("sin puntos forward, el forward sale de la paridad cubierta con tasas de mercado (IBR y SOFR, sin el spread)", () => {
    const c = compararExterior(9e9, base);
    expect(c.origenForward).toBe("paridad");
    expect(c.sofrEA).toBeCloseTo(eaDesdeOvernight360(0.0389), 15);
    expect(c.devForward).toBeCloseTo(devParidad(0.11, c.sofrEA), 15);
    expect(c.forward).toBeCloseTo(4000 * Math.pow(1.11 / (1 + c.sofrEA), 90 / 365), 9);
    // cubierto ≈ tasa en pesos de mercado + el spread del crédito
    const cub = c.filas.find((f) => f.alternativa === "cubierto")!;
    expect(cub.tasaEA).toBeCloseTo((1 + c.tasaUSD) * (1.11 / (1 + c.sofrEA)) - 1, 12);
    expect(cub.tasaEA).toBeGreaterThan(0.11);
  });

  it("devaluación de equilibrio: sin cubrir con esa devaluación cuesta lo mismo que en pesos", () => {
    const t = tasaUSD(base.sofr, base.spread);
    const dEq = devEquilibrio(base.tasaCOP, t);
    expect(dEq).toBeCloseTo((1 + 0.1225) / (1 + t) - 1, 15);
    expect(costoEnPesos(t, dEq)).toBeCloseTo(0.1225, 12);
  });

  it("sin expectativa propia, sin cubrir usa la devaluación implícita y en empate gana cubierto (menos riesgo)", () => {
    const c = compararExterior(9e9, { ...base, devEsperada: null, tasaCOP: 0.2 });
    expect(c.devEsperada).toBe(c.devForward);
    const [, sin, cub] = c.filas;
    expect(sin.tasaEA).toBeCloseTo(cub.tasaEA, 15);
    expect(c.masBarata).toBe("cubierto");
  });

  it("con devaluación esperada baja, sin cubrir es lo más barato; con puntos caros, el forward encarece", () => {
    expect(compararExterior(9e9, base).masBarata).toBe("sinCubrir");
    const caro = compararExterior(9e9, { ...base, devEsperada: 0.15, puntosForward: 200 });
    expect(caro.origenForward).toBe("puntos");
    expect(caro.forward).toBe(4200);
    expect(caro.devForward).toBeCloseTo(Math.pow(1.05, 365 / 90) - 1, 12);
    expect(caro.masBarata).toBe("local");
  });
});

describe("Datos del día por defecto", () => {
  const ibr = { fecha: "2026-11-11", on: 0.114, m1: 0.1147, m3: 0.1163, m6: 0.1185 };
  const mercado: MercadoFondeo = { sofr: 0.0389, spot: 3297.07, spot12m: { valor: 3760.93, fecha: "2025-11-11" }, tpm: 0.1225, ibr };

  it("simultánea usa la TPM del día; interbancario, el IBR overnight + spread; manual manda", () => {
    expect(tasaLocalEA(CONFIG_INICIAL, mercado)).toBe(0.1225);
    expect(tasaLocalEA({ ...CONFIG_INICIAL, tipo: "ibr", spreadIbr: 0.005 }, mercado)).toBeCloseTo(eaDesdeOvernight360(0.119), 15);
    expect(tasaLocalEA({ ...CONFIG_INICIAL, tasa: 0.13 }, mercado)).toBe(0.13);
    expect(tasaLocalEA({ ...CONFIG_INICIAL, tasa: 0.12, modalidad: "NA", capitalizacion: "trimestral" }, mercado)).toBeCloseTo(Math.pow(1.03, 4) - 1, 15);
  });

  it("sin dato del día no se inventa una tasa", () => {
    expect(tasaLocalEA(CONFIG_INICIAL, { ...mercado, tpm: null })).toBeNull();
    expect(tasaLocalEA({ ...CONFIG_INICIAL, tipo: "credito" }, mercado)).toBeNull(); // el crédito no tiene dato público
    expect(faltante({ ...CONFIG_INICIAL, tipo: "credito" }, mercado)).toMatch(/crédito/);
    const ext: ConfigFondeo = { ...CONFIG_INICIAL, tipo: "exterior" };
    expect(tasaEfectiva(ext, { ...mercado, sofr: null })).toBeNull();
    expect(faltante(ext, { ...mercado, sofr: null })).toMatch(/SOFR/);
  });

  it("la tasa en pesos de mercado es el IBR del plazo del forward, en E.A.", () => {
    expect(ibrEA(0.1163, 90)).toBeCloseTo(Math.pow(1 + (0.1163 * 90) / 360, 365 / 90) - 1, 15);
    expect(ibrParaPlazo(ibr, 90).plazo).toBe("3 meses");
    expect(ibrParaPlazo(ibr, 40).plazo).toBe("1 mes");
    expect(ibrParaPlazo(ibr, 1).ea).toBeCloseTo(eaDesdeOvernight360(0.114), 15);
    expect(tasaCOPMercado(CONFIG_INICIAL, mercado)).toBeCloseTo(ibrEA(0.1163, 90), 15);
  });

  it("exterior con todo automático: SOFR, TRM, IBR y devaluación implícita del día", () => {
    const ext: ConfigFondeo = { ...CONFIG_INICIAL, tipo: "exterior" };
    const cmp = comparacion(ext, mercado, 1e9)!;
    expect(cmp.devForward).toBeCloseTo(devParidad(ibrEA(0.1163, 90), eaDesdeOvernight360(0.0389)), 15);
    expect(tasaEfectiva(ext, mercado)).toBeCloseTo(cmp.filas.find((f) => f.alternativa === "cubierto")!.tasaEA, 15);
    expect(cmp.filas[0].tasaEA).toBeCloseTo(ibrEA(0.1163, 90), 15); // referencia local = IBR del plazo
  });

  it("devaluación de los últimos 12 meses con la TRM de hace un año", () => {
    expect(devUltimos12m(mercado)).toBeCloseTo(3297.07 / 3760.93 - 1, 15);
    expect(devUltimos12m({ ...mercado, spot12m: null })).toBeNull();
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
    const t = carryPortafolioFondeo([CASO, { ...CASO, giro: CASO.giro / 2, dv01: CASO.dv01 / 2 }], CONFIG_INICIAL, { sofr: null, spot: null, tpm: 0.1225 })!;
    const uno = calcularCarry(CASO, REPO, 0.1225);
    expect(t.pctFondeado).toBeCloseTo(0.9, 12);
    expect(t.carryDia).toBeCloseTo(uno.carryDia * 1.5, 6);
    expect(t.costoDia).toBeCloseTo(uno.costoDia.cop * 1.5, 6);
    expect(t.horizontes[2].colchonPb).toBeCloseTo(uno.horizontes[2].colchonPb, 9);
  });
});
