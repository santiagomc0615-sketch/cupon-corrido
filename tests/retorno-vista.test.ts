/* Presentación del retorno esperado: la cascada cierra exactamente en el total de la tabla y el % sobre
   el capital propio es consistente con el ROE del panel «Carry y fondeo» (lib/carry). */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { retornoEsperado, HORIZONTES_DIAS, type CurvaRef } from "@/lib/analisis/retorno-esperado";
import { anualizarPct, diasCurva, pasosCascada, porcentajes } from "@/lib/analisis/retorno-vista";
import { calcularCarry, montos } from "@/lib/carry/fondeo";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { crearMotor, esError, type DatosMercado } from "@/lib/engine";
import { tasaPeriodo } from "@/lib/carry/tasas";

const D = datos as unknown as DatosMercado;
const motor = crearMotor(D);
const def = crearDefaults("2026-11-04");
const b = toEngine(def.TF);
const o = motor.price(b);
if (esError(o)) throw new Error(o.error);
const CURVA: CurvaRef = { fecha: D.curveDate, refs: D.tes.map((r) => [r[4], r[3]] as [number, number]) };
const tasa = 0.1225,
  haircut = 0.1;
const fondeo = { tipo: "repo" as const, haircut };
const costo = (d: number) => montos(o.giro, fondeo).fondeado * tasaPeriodo(tasa, d); // = lib/carry
const sin = (r: ReturnType<typeof retornoEsperado>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("Cascada", () => {
  it("el último nivel es exactamente el total de la tabla en todos los horizontes, con y sin fondeo", () => {
    for (const d of HORIZONTES_DIAS)
      for (const activo of [false, true]) {
        const r = sin(retornoEsperado(motor, b, o, d, CURVA, activo ? costo : () => 0));
        const pasos = pasosCascada(r, activo);
        const total = pasos[pasos.length - 1];
        expect(total.clave).toBe("total");
        expect(total.hasta).toBe(r.total); // igualdad exacta
        expect(pasos[pasos.length - 2].hasta).toBe(r.total); // la escalera llega al total
        expect(pasos.some((p) => p.clave === "costo")).toBe(activo);
      }
  });

  it("sin roll-down (IBR) la cascada omite ese paso y sigue cerrando", () => {
    const bi = toEngine(def.IBR);
    const oi = motor.price(bi);
    if (esError(oi)) throw new Error(oi.error);
    const r = sin(retornoEsperado(motor, bi, oi, 90, null));
    const pasos = pasosCascada(r, false);
    expect(pasos.map((p) => p.clave)).toEqual(["causacion", "total"]);
    expect(pasos[1].hasta).toBe(r.total);
  });
});

describe("Porcentajes", () => {
  it("% sobre capital propio = total / (giro × haircut); % de la posición = total / giro", () => {
    const r = sin(retornoEsperado(motor, b, o, 365, CURVA, costo));
    const cp = montos(o.giro, fondeo).capital;
    expect(cp).toBeCloseTo(o.giro * haircut, 4);
    const p = porcentajes(r.total, o.giro, cp, 365);
    expect(p.capitalPropio).toBeCloseTo(r.total / (o.giro * haircut), 12);
    expect(p.posicion).toBeCloseTo(r.total / o.giro, 12);
    expect(p.capitalPropio / p.posicion).toBeCloseTo(1 / haircut, 9);
  });

  it("consistente con el ROE del panel de carry: a 30 días (sin cupones en el periodo) causación − fondeo sobre capital propio = ROE", () => {
    const r = sin(retornoEsperado(motor, b, o, 30, CURVA, costo));
    expect(r.cupones).toBe(0);
    const carry = calcularCarry(posicionDesdeMotor(b, o), fondeo, tasa, [30]).horizontes[0];
    const cp = montos(o.giro, fondeo).capital;
    const roeRetorno = (r.causacion - r.costoFondeo) / cp; // el carry no incluye roll-down
    // el costo de fondeo es idéntico; la causación difiere solo por el truncamiento del precio a 3 decimales
    expect(r.costoFondeo).toBeCloseTo(carry.costo, 4);
    expect(Math.abs(roeRetorno - carry.roe)).toBeLessThan(0.0005); // < 0,05 puntos
    // y el % total sobre capital propio = ROE del carry + roll-down sobre capital propio
    expect(porcentajes(r.total, o.giro, cp, 30).capitalPropio).toBeCloseTo(roeRetorno + r.roll! / cp, 12);
  });

  it("anualizado: E.A. del periodo; «No aplica» (null) si se pierde todo el capital", () => {
    expect(anualizarPct(0.1, 365)).toBeCloseTo(0.1, 12);
    expect(anualizarPct(0.02, 30)).toBeCloseTo(Math.pow(1.02, 365 / 30) - 1, 12);
    expect(anualizarPct(-1.2, 90)).toBeNull();
  });

  it("días de la curva: de 0 a 365 con 30, 90 y 180 exactos", () => {
    const d = diasCurva(5);
    expect(d[0]).toBe(0);
    expect(d[d.length - 1]).toBe(365);
    for (const x of [30, 90, 180]) expect(d).toContain(x);
    expect(diasCurva(7, 200).at(-1)).toBe(200);
  });
});
