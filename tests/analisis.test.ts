/* Análisis del título (lib/analisis): liquidez, valorización, atribución y spreads. Usa el motor real. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { atribucionDesdeCompra } from "@/lib/analisis/atribucion";
import { conTasa, tasaDe } from "@/lib/analisis/comunes";
import { colorBidAsk, colorMonto, esReferenciaTES, semaforoLiquidez } from "@/lib/analisis/liquidez";
import { cuantil, etiquetaSpread, evaluarSpread, leerHistoriaCSV, percentil, spreadActual } from "@/lib/analisis/spreads";
import { potencialValorizacion } from "@/lib/analisis/valorizacion";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { crearMotor, esError, type Bono, type DatosMercado } from "@/lib/engine";

const motor = crearMotor(datos as unknown as DatosMercado);
const def = crearDefaults("2026-11-04");
const bono = (t: keyof typeof def): Bono => toEngine(def[t]);
const valorar = (b: Bono) => {
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return o;
};

describe("Semáforo de liquidez", () => {
  it("umbrales de bid-ask y monto", () => {
    expect(colorBidAsk(5)).toBe("verde");
    expect(colorBidAsk(10)).toBe("verde");
    expect(colorBidAsk(25)).toBe("amarillo");
    expect(colorBidAsk(31)).toBe("rojo");
    expect(colorMonto(2e12)).toBe("verde");
    expect(colorMonto(5e11)).toBe("amarillo");
    expect(colorMonto(1e11)).toBe("rojo");
  });

  it("TES de referencia con bid-ask estrecho: alta", () => {
    const r = semaforoLiquidez({ tasaCompra: 0.1215, tasaVenta: 0.1212, montoEmitido: 2e13, referenciaTES: true });
    expect(r.bidAskPb).toBeCloseTo(3, 9);
    expect(r).toMatchObject({ color: "verde", nivel: "Alta" });
    expect(r.senales).toHaveLength(3);
  });

  it("bono privado pequeño con bid-ask amplio: baja; sin monto solo cuenta el bid-ask", () => {
    expect(semaforoLiquidez({ tasaCompra: 0.136, tasaVenta: 0.115, montoEmitido: 2e11 }).color).toBe("rojo");
    const m = semaforoLiquidez({ tasaCompra: 0.13, tasaVenta: 0.128 });
    expect(m.senales).toHaveLength(1);
    expect(m.color).toBe("amarillo"); // 20 pb
  });

  it("detecta si el vencimiento es de un TES de la curva", () => {
    expect(esReferenciaTES("TF", "2036-07-09", ["2036-07-09", "2031-03-26"])).toBe(true);
    expect(esReferenciaTES("IPC", "2036-07-09", ["2036-07-09"])).toBe(false);
  });
});

describe("Potencial de valorización", () => {
  const b = bono("TF");
  const o = valorar(b);

  it("con la misma tasa no hay ganancia", () => {
    const v = potencialValorizacion(motor, b, o, tasaDe(b));
    if ("error" in v) throw new Error(v.error);
    expect(v.ganancia).toBeCloseTo(0, 6);
  });

  it("si la tasa baja 100 pb, el precio objetivo lo da el motor y la ganancia es positiva", () => {
    const v = potencialValorizacion(motor, b, o, tasaDe(b) - 0.01);
    if ("error" in v) throw new Error(v.error);
    const ref = valorar(conTasa(b, tasaDe(b) - 0.01));
    expect(v.precioObjetivo).toBe(ref.dirty);
    expect(v.ganancia).toBeCloseTo(ref.giro - o.giro, 6);
    expect(v.ganancia).toBeGreaterThan(0);
    expect(v.cambioPb).toBeCloseTo(-100, 9);
    // Cerca de la duración: ~D* % por 100 pb
    expect(v.gananciaPct * 100).toBeGreaterThan(o.mod * 0.9);
    expect(v.gananciaPct * 100).toBeLessThan(o.mod * 1.2);
  });

  it("también en IPC (mueve el spread)", () => {
    const bi = bono("IPC");
    const v = potencialValorizacion(motor, bi, valorar(bi), tasaDe(bi) + 0.005);
    if ("error" in v) throw new Error(v.error);
    expect(v.ganancia).toBeLessThan(0);
  });
});

describe("Atribución desde la compra", () => {
  const b = bono("TF");

  it("causación + valorización = total, y cuadra con los tres precios del motor", () => {
    const a = atribucionDesdeCompra(motor, b, { fechaCompra: "2026-10-20", tasaCompra: 0.136, fechaHoy: "2027-02-15", tasaMercado: 0.13 });
    if ("error" in a) throw new Error(a.error);
    expect(a.causacion + a.valorizacion).toBeCloseTo(a.total, 6);
    expect(a.total).toBeCloseTo(a.giroHoy + a.totalCupones - a.giroCompra, 6);
    expect(a.cupones.map((c) => c.fecha)).toEqual(["2027-01-20"]); // cupón trimestral pagado en el camino
    expect(a.valorizacion).toBeGreaterThan(0); // la tasa bajó 60 pb
    expect(a.causacion).toBeGreaterThan(0);
    expect(a.giroCompra).toBe(valorar(conTasa(b, 0.136, "2026-10-20")).giro);
  });

  it("sin cambio de tasa no hay valorización y la causación es ~la TIR del periodo", () => {
    const a = atribucionDesdeCompra(motor, b, { fechaCompra: "2026-10-20", tasaCompra: 0.136, fechaHoy: "2027-10-20", tasaMercado: 0.136 });
    if ("error" in a) throw new Error(a.error);
    expect(a.valorizacion).toBe(0);
    expect(a.cupones).toHaveLength(4);
    expect(a.rentabilidadEA).toBeGreaterThan(0.125); // cupones sin reinvertir: algo menos que la TIR
    expect(a.rentabilidadEA).toBeLessThan(0.14);
  });

  it("valida las fechas", () => {
    expect(atribucionDesdeCompra(motor, b, { fechaCompra: "2027-01-01", tasaCompra: 0.136, fechaHoy: "2026-12-01", tasaMercado: 0.13 })).toHaveProperty("error");
    expect(atribucionDesdeCompra(motor, b, { fechaCompra: "2026-01-01", tasaCompra: 0.136, fechaHoy: "2026-12-01", tasaMercado: 0.13 })).toHaveProperty("error");
  });
});

describe("Monitor de spreads", () => {
  it("spread actual del motor (tasa fija y UVR); IPC/IBR no tienen", () => {
    const o = valorar(bono("TF"));
    expect(spreadActual(o)).toMatchObject({ pb: o.tipo === "TF" ? o.spreadCurve : NaN });
    expect(spreadActual(valorar(bono("UVR")))?.pb).toBeTypeOf("number");
    expect(spreadActual(valorar(bono("IPC")))).toBeNull();
  });

  it("lee el CSV con referencia (punto y coma, coma decimal, en %)", () => {
    const csv = "fecha;tir;tes\n2026-01-31;13,10;11,00\n2026-02-28;13,20;11,05\n2026-03-31;13,00;11,10\n2026-04-30;13,40;11,00\n2026-05-31;13,30;11,20\n";
    const h = leerHistoriaCSV(csv, null);
    if ("error" in h) throw new Error(h.error);
    expect(h.referencia).toBe("archivo");
    expect(h.puntos.map((p) => Math.round(p.pb))).toEqual([210, 215, 190, 240, 210]);
    expect(h.avisos[0]).toMatch(/omitieron/); // el encabezado
  });

  it("sin referencia en el archivo usa la de hoy y lo avisa; con pocas fechas da error", () => {
    const csv = "2026-01-31,0.131\n2026-02-28,0.132\n2026-03-31,0.130\n2026-04-30,0.134\n2026-05-31,0.133";
    const h = leerHistoriaCSV(csv, 0.12);
    if ("error" in h) throw new Error(h.error);
    expect(h.referencia).toBe("motor");
    expect(h.puntos[0].pb).toBeCloseTo(110, 9);
    expect(leerHistoriaCSV("2026-01-31,0.13", 0.12)).toHaveProperty("error");
    expect(leerHistoriaCSV(csv, null)).toHaveProperty("error");
  });

  it("percentil y etiqueta: barato arriba de p75, caro abajo de p25", () => {
    const serie = [100, 120, 140, 160, 180, 200, 220, 240];
    expect(percentil(serie, 240)).toBe(100);
    expect(percentil(serie, 100)).toBe(12.5);
    expect(cuantil(serie, 50)).toBe(170);
    expect(etiquetaSpread(80)).toBe("barato");
    expect(etiquetaSpread(50)).toBe("en rango");
    expect(etiquetaSpread(20)).toBe("caro");
    const pts = serie.map((pb, i) => ({ fecha: `2026-0${(i % 9) + 1}-01`, tir: 0, referencia: 0, pb }));
    expect(evaluarSpread(pts, 230).etiqueta).toBe("barato");
    expect(evaluarSpread(pts, 105).etiqueta).toBe("caro");
  });
});
