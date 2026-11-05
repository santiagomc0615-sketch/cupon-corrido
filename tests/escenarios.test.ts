/* Escenarios de política monetaria sobre el portafolio. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { crearDefaults, crearPfEjemplo, toEngine, type Posicion } from "@/lib/calculadora";
import { crearMotor, esError, type DatosMercado, type PosicionValorada } from "@/lib/engine";
import { deltaCurva, escenarioPortafolio, mercadoConIBR, SUPUESTOS_INICIALES } from "@/lib/escenarios";

const D = datos as unknown as DatosMercado;
const FECHA = "2026-11-04";
const motor = crearMotor(D);
const V: PosicionValorada<Posicion>[] = crearPfEjemplo(crearDefaults(FECHA))
  .map((p) => {
    const b = toEngine(p.inputs);
    return { p, b, o: motor.price(b) };
  })
  .filter((x): x is PosicionValorada<Posicion> => !esError(x.o));

describe("Escenarios BanRep", () => {
  it("el traspaso a la curva va del corto al largo plazo", () => {
    const s = { ...SUPUESTOS_INICIALES, pb: -100 };
    expect(deltaCurva(s, 0.5)).toBeCloseTo(-80, 10);
    expect(deltaCurva(s, 10)).toBeCloseTo(-30, 10);
    expect(deltaCurva(s, 5.5)).toBeCloseTo(-55, 10);
  });

  it("sin cambio de tasa el portafolio no cambia", () => {
    const r = escenarioPortafolio(D, V, FECHA, { ...SUPUESTOS_INICIALES, pb: 0 });
    expect(r.filas.length).toBe(4);
    for (const f of r.filas) expect(Math.abs(f.delta)).toBeLessThan(1e-6);
  });

  it("un recorte valoriza la tasa fija; el IBR casi no cambia frente a una tasa fija", () => {
    const r = escenarioPortafolio(D, V, FECHA, { ...SUPUESTOS_INICIALES, pb: -100 });
    const tf = r.filas.find((f) => f.tipo === "TF")!;
    const ibr = r.filas.find((f) => f.tipo === "IBR")!;
    expect(tf.delta).toBeGreaterThan(0);
    expect(Math.abs(ibr.deltaPct)).toBeLessThan(Math.abs(tf.deltaPct) / 3);
    expect(r.delta).toBeCloseTo(r.filas.reduce((s, f) => s + f.delta, 0), 2);
  });

  it("un alza desvaloriza la tasa fija con el mismo orden de magnitud que la duración", () => {
    const r = escenarioPortafolio(D, V, FECHA, { pb: 100, corto: 1, largo: 1, ibr: 1 });
    const tf = r.filas.find((f) => f.tipo === "TF")!;
    const x = V.find((v) => v.b.tipo === "TF")!;
    // ΔP/P ≈ −D*·Δy
    expect(tf.deltaPct).toBeLessThan(0);
    expect(Math.abs(tf.deltaPct + x.o.mod * 0.01)).toBeLessThan(0.003);
  });

  it("el mercado con choque mueve el IBR vigente pero no los datos anteriores", () => {
    const m = mercadoConIBR(D, FECHA, -0.01);
    const ult = m.ibr.filter((r) => r[0] < FECHA).at(-1)!;
    const orig = D.ibr.filter((r) => r[0] < "2026-11-03").at(-1)!;
    expect(ult[0]).toBe("2026-11-03");
    expect(ult[3]).toBeCloseTo(orig[3] - 1, 10);
    expect(m.ibr.length).toBe(D.ibr.filter((r) => r[0] !== "2026-11-03").length + 1);
  });
});
