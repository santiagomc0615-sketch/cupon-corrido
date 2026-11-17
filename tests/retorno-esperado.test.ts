/* Retorno esperado a un horizonte (lib/analisis/retorno-esperado): causación, roll-down con la curva
   TES + el spread actual, costo de fondeo y total. Todas las valoraciones son del motor. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import casos from "@/validacion/casos-prueba.json";
import { conTasa } from "@/lib/analisis/comunes";
import { HORIZONTES_DIAS, retornoEsperado, sumarRetornos, type CurvaRef } from "@/lib/analisis/retorno-esperado";
import { crearMotor, esError, toN, type Bono, type DatosMercado, type ResultadoValoracion } from "@/lib/engine";

const D = datos as unknown as DatosMercado;
const motor = crearMotor(D);
const valorar = (b: Bono) => {
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return o as ResultadoValoracion;
};
const bTF = casos.casos.TF.entrada as Bono;
const oTF = valorar(bTF);
const CURVA_TES: CurvaRef = { fecha: D.curveDate, refs: D.tes.map((r) => [r[4], r[3]] as [number, number]) };
const sinError = <T,>(r: T | { error: string }): T => {
  if (r && typeof r === "object" && "error" in r) throw new Error((r as { error: string }).error);
  return r as T;
};

describe("Causación (tasa constante)", () => {
  it("con la TIR constante, el valor de hoy = VP del valor en el horizonte + VP de los cupones cobrados", () => {
    const val = toN(bTF.valoracion);
    for (const d of HORIZONTES_DIAS) {
      const r = sinError(retornoEsperado(motor, bTF, oTF, d, null));
      const n1 = toN(r.fecha);
      const cobrados = oTF.rows.filter((x) => x.pay > val && x.pay <= n1);
      const v1 = r.valorHoy + r.cambioPrecio;
      const vp = v1 / Math.pow(1 + oTF.irr, (n1 - val) / 365) + cobrados.reduce((s, x) => s + ((x.L / 100) * bTF.nominal) / Math.pow(1 + oTF.irr, (x.pay - val) / 365), 0);
      // los precios sucios se truncan a 3 decimales: tolerancia de 0,002 % del nominal
      expect(Math.abs(vp - oTF.giro) / bTF.nominal).toBeLessThan(2e-5);
      expect(r.causacion).toBeCloseTo(r.cambioPrecio + r.cupones, 6);
    }
  });
});

describe("Roll-down", () => {
  it("con la curva plana el roll-down es exactamente cero", () => {
    const plana: CurvaRef = { fecha: bTF.valoracion, refs: [[0.5, 0.12], [20, 0.12]] };
    const r = sinError(retornoEsperado(motor, bTF, oTF, 365, plana));
    expect(r.tasaRoll).toBeCloseTo(r.tasaHoy, 15);
    expect(r.roll).toBe(0);
  });

  it("caso a mano: curva lineal de 10 % a 1 año y 15 % a 11 años (0,5 % por año)", () => {
    // spread = TIR − curva(plazo hoy); a 365 días el plazo baja exactamente 1 año (365/365),
    // así que la tasa de roll-down = TIR de hoy − 0,5 % (mismo spread, 50 pb más abajo en la curva).
    const lineal: CurvaRef = { fecha: bTF.valoracion, refs: [[1, 0.1], [11, 0.15]] };
    const r = sinError(retornoEsperado(motor, bTF, oTF, 365, lineal));
    expect(r.tasaRoll!).toBeCloseTo(r.tasaHoy - 0.005, 12);
    // Ganancia = valor con la tasa de roll-down − valor con la tasa de hoy, ambos del motor en el horizonte
    const conRoll = valorar(conTasa(bTF, r.tasaHoy - 0.005, r.fecha));
    const sinRoll = valorar(conTasa(bTF, r.tasaHoy, r.fecha));
    expect(r.roll!).toBeCloseTo(conRoll.giro - sinRoll.giro, 4);
    expect(r.roll!).toBeGreaterThan(0);
  });

  it("con la curva TES del día y pendiente positiva, el TF gana por roll-down", () => {
    const r = sinError(retornoEsperado(motor, bTF, oTF, 365, CURVA_TES));
    expect(r.roll!).toBeGreaterThan(0);
  });

  it("IBR e IPC no tienen roll-down; UVR solo con curva UVR", () => {
    for (const k of ["IBR", "IPC"] as const) {
      const b = casos.casos[k].entrada as Bono;
      expect(sinError(retornoEsperado(motor, b, valorar(b), 180, null)).roll).toBeNull();
    }
    const bU = casos.casos.UVR.entrada as Bono;
    const oU = valorar(bU);
    expect(sinError(retornoEsperado(motor, bU, oU, 180, null)).roll).toBeNull();
    const curvaUVR: CurvaRef = { fecha: bU.valoracion, refs: [[1, 0.04], [11, 0.05]] };
    expect(sinError(retornoEsperado(motor, bU, oU, 180, curvaUVR)).roll).not.toBeNull();
  });
});

describe("Total, fondeo y vencimiento", () => {
  it("total = causación + roll-down − costo de fondeo; % y anualizado sobre el valor de hoy", () => {
    const costo = (d: number) => 1_000_000 * d; // $1 millón por día
    const r = sinError(retornoEsperado(motor, bTF, oTF, 90, CURVA_TES, costo));
    expect(r.costoFondeo).toBe(90_000_000);
    expect(r.total).toBeCloseTo(r.causacion + r.roll! - 90_000_000, 6);
    expect(r.pct).toBeCloseTo(r.total / oTF.giro, 12);
    expect(r.anual).toBeCloseTo(Math.pow(1 + r.pct, 365 / 90) - 1, 12);
  });

  it("si vence antes del horizonte se mide hasta el vencimiento, con el capital y sin roll-down", () => {
    const b = { ...bTF, valoracion: "2031-08-01" } as Bono; // vence el 2031-10-20 (casos TF)
    const o = valorar(b);
    const r = sinError(retornoEsperado(motor, b, o, 365, CURVA_TES));
    expect(r.vence).toBe(true);
    expect(r.fecha).toBe(b.vencimiento);
    expect(r.roll).toBeNull();
    expect(r.cupones).toBeGreaterThan(b.nominal); // incluye el capital
  });

  it("el portafolio suma las posiciones por horizonte", () => {
    const filas = [bTF, casos.casos.IBR.entrada as Bono].map((b) => {
      const o = valorar(b);
      return HORIZONTES_DIAS.map((d) => retornoEsperado(motor, b, o, d, b.tipo === "TF" ? CURVA_TES : null));
    });
    const t = sumarRetornos(filas);
    expect(t).toHaveLength(4);
    const a = sinError(filas[0][3]),
      b = sinError(filas[1][3]);
    expect(t[3].total).toBeCloseTo(a.total + b.total, 6);
    expect(t[3].roll).toBeCloseTo(a.roll!, 6);
  });
});
