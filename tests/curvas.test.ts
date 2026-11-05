/* Curva cero TES (Curva_Rendimiento), varias curvas FRAC y venta IBR con curva de venta (Rentabilidad). */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import {
  CURVA_EXCEL,
  crearMotor,
  curvaCero,
  edate,
  esError,
  plazoTES,
  toN,
  toS,
  trunc3,
  type BonoIBR,
  type DatosMercado,
  type ResultadoIBR,
  type TuplaFecha,
} from "@/lib/engine";

const D = datos as unknown as DatosMercado;

describe("Curva cero cupón TES (bootstrapping)", () => {
  it("reproduce la curva cero del Excel a partir de las referencias TES", () => {
    const z = curvaCero(D.tes);
    expect(z.length).toBe(D.zero.length);
    z.forEach(([t, r], i) => {
      expect(t).toBe(D.zero[i][0]);
      expect(Math.abs(r - D.zero[i][1])).toBeLessThan(1e-12);
    });
  });

  it("calcula el plazo de cada TES como la columna G (días reales / 365)", () => {
    for (const r of D.tes) expect(Math.abs(plazoTES(D.curveDate, r[1]) - r[4])).toBeLessThan(1e-12);
  });
});

/* Curva FRAC alternativa: la del Excel desplazada +100 pb y con otra fecha base. */
const desplazada = (fechaBase: string, pb: number): TuplaFecha[] => {
  const n0 = toN(fechaBase);
  return D.frac.map(([, v], i) => [toS(n0 + i), v + pb / 1e4]);
};

const bonoFRAC: BonoIBR = {
  tipo: "IBR",
  nominal: 5e9,
  emision: "2025-09-15",
  vencimiento: "2028-09-15",
  spread: 0.018,
  frecuencia: "Trimestral",
  base: "30/360",
  valoracion: "2026-11-04",
  spreadCompra: 0.017,
  spreadVenta: 0.019,
  metodologia: "Curva FRAC",
  descuento: "Encadenado por periodo",
};

describe("Varias curvas FRAC", () => {
  const motor = crearMotor({
    ...D,
    curvasFrac: [
      { id: "compra", nombre: "FRAC compra", fechaBase: "2026-11-04", filas: D.frac.length, datos: desplazada("2026-11-04", 100) },
      { id: "venta", nombre: "FRAC venta", fechaBase: "2027-05-04", filas: D.frac.length, datos: desplazada("2027-05-04", -100) },
      { id: "sin-datos", nombre: "Pendiente", fechaBase: "2027-08-01", filas: 10 },
    ],
  });

  it("sin curva pedida usa la de fecha base igual a la valoración", () => {
    const o = motor.price(bonoFRAC);
    if (esError(o)) throw new Error(o.error);
    expect(o.tipo === "IBR" && o.curvaFracId).toBe("compra");
    expect(o.tipo === "IBR" && o.fracStale).toBe(false);
  });

  it("una curva pedida por id cambia la valoración", () => {
    const a = motor.price(bonoFRAC),
      b = motor.price({ ...bonoFRAC, curvaFrac: CURVA_EXCEL });
    if (esError(a) || esError(b)) throw new Error("error");
    expect(b.tipo === "IBR" && b.curvaFracId).toBe(CURVA_EXCEL);
    // Con descuento encadenado el forward entra en cupones y en la tasa de descuento,
    // así que el precio cambia poco pero sí cambia; los cupones proyectados suben.
    expect(a.dirty).not.toBe(b.dirty);
    const cuponesA = a.rows.filter((r) => r.N > 0).reduce((s, r) => s + r.K, 0);
    const cuponesB = b.rows.filter((r) => r.N > 0).reduce((s, r) => s + r.K, 0);
    expect(cuponesA).toBeGreaterThan(cuponesB);
  });

  it("con una sola curva (la del Excel) el resultado no cambia", () => {
    const solo = crearMotor(D).price(bonoFRAC);
    const pedida = crearMotor(D).price({ ...bonoFRAC, curvaFrac: CURVA_EXCEL });
    expect(pedida).toEqual(solo);
  });

  it("avisa si la curva elegida aún no se descargó", () => {
    const o = motor.price({ ...bonoFRAC, curvaFrac: "sin-datos" });
    expect(esError(o) && o.error).toMatch(/aún no está cargada/);
  });
});

describe("Venta IBR con curva de venta", () => {
  const motor = crearMotor({
    ...D,
    curvasFrac: [{ id: "venta", nombre: "FRAC venta", fechaBase: "2027-05-04", filas: D.frac.length, datos: desplazada("2027-05-04", 0) }],
  });
  const b: BonoIBR = { ...bonoFRAC, metodologia: "IBR vigente", descuento: "TIR con IBR promedio" };
  const o = motor.price(b) as ResultadoIBR;

  it("elige la curva por la fecha de venta y trunca el precio a 3 decimales", () => {
    const h = motor.holdingCurvaIBR(b, o, "2027-05-04", 0.02);
    if (esError(h)) throw new Error(h.error);
    expect(h.curvaId).toBe("venta");
    expect(h.curvaDesfasada).toBe(false);
    expect(h.pVenta).toBe(trunc3(h.periodos.reduce((s, x) => s + x.vp, 0)));
    expect(h.limpio).toBeCloseTo(h.pVenta - h.corrido, 12);
    expect(h.tasaVenta).toBeCloseTo(Math.pow(1 + (h.ibrPromVenta + 0.02) / 4, 4) - 1, 15);
  });

  it("los periodos posteriores a la venta usan el forward de la curva", () => {
    const h = motor.holdingCurvaIBR(b, o, "2027-05-04", 0.02);
    if (esError(h)) throw new Error(h.error);
    const filasDespues = o.rows.filter((r) => r.start > toN("2027-05-04"));
    const curva = desplazada("2027-05-04", 0);
    for (const r of filasDespues) {
      const p = h.periodos.find((x) => x.pay === r.pay)!;
      const esperado = curva.filter(([f]) => toN(f) <= r.start).at(-1)![1];
      expect(p.ibr).toBe(esperado);
      expect(p.flujo).toBeCloseTo((100 * (esperado + b.spread) * r.D) / 360 + r.amort, 12);
    }
  });

  it("vendiendo en fecha de cupón con spread de venta = spread facial, el precio queda cerca de la par", () => {
    const bReal: BonoIBR = { ...b, base: "Real/365" };
    const oReal = motor.price(bReal) as ResultadoIBR;
    const fechaCupon = toS(edate(toN(bReal.emision), 21)); // cupón 7
    const h = motor.holdingCurvaIBR(bReal, oReal, fechaCupon, bReal.spread, "venta");
    if (esError(h)) throw new Error(h.error);
    expect(h.corrido).toBe(0);
    expect(Math.abs(h.pVenta - 100)).toBeLessThan(0.3);
  });

  it("avisa cuando la curva de venta es de otra fecha", () => {
    const h = motor.holdingCurvaIBR(b, o, "2027-08-20", 0.02);
    if (esError(h)) throw new Error(h.error);
    expect(h.curvaDesfasada).toBe(true);
  });

  it("valida las fechas de venta", () => {
    expect(motor.holdingCurvaIBR(b, o, "2026-10-01", 0.02)).toEqual({ error: "La fecha de venta debe ser posterior a la compra" });
    expect(motor.holdingCurvaIBR(b, o, "2030-01-01", 0.02)).toEqual({ error: "La venta debe ser antes del vencimiento" });
  });
});
