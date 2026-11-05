/* Carry y roll-down. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import casos from "@/validacion/casos-prueba.json";
import { carryPortafolio, carryPosicion } from "@/lib/carry";
import { crearMotor, esError, type Bono, type DatosMercado, type PosicionValorada, type ResultadoValoracion } from "@/lib/engine";

const motor = crearMotor(datos as unknown as DatosMercado);
const pos = (b: Bono): PosicionValorada<string> => {
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return { p: "x", b, o: o as ResultadoValoracion };
};

describe("Carry y roll-down", () => {
  it("con la TIR constante, el precio de hoy = VP del precio en el horizonte + VP de los cupones cobrados", () => {
    const x = pos(casos.casos.TF.entrada as Bono);
    const val = Date.parse(x.b.valoracion) / 864e5;
    for (const h of [3, 6, 12] as const) {
      const c = carryPosicion(motor, x, h)!;
      const n1 = Date.parse(c.fecha) / 864e5;
      const cobrados = x.o.rows.filter((r) => r.pay > val && r.pay <= n1);
      const cup = cobrados.reduce((s, r) => s + r.L / 100, 0) * x.b.nominal;
      const p1 = (1 + c.carry) * x.o.giro - cup; // giro en el horizonte
      const vp = p1 / Math.pow(1 + x.o.irr, (n1 - val) / 365) + cobrados.reduce((s, r) => s + ((r.L / 100) * x.b.nominal) / Math.pow(1 + x.o.irr, (r.pay - val) / 365), 0);
      // los precios sucios se truncan a 3 decimales: tolerancia de 0,002 % del nominal
      expect(Math.abs(vp - x.o.giro) / x.b.nominal).toBeLessThan(2e-5);
    }
  });

  it("con la curva TES de pendiente positiva, el roll-down de un TF es positivo", () => {
    const c = carryPosicion(motor, pos(casos.casos.TF.entrada as Bono), 12)!;
    expect(c.roll).not.toBeNull();
    expect(c.roll!).toBeGreaterThan(0);
    expect(c.total).toBeCloseTo(c.carry + c.roll!, 15);
  });

  it("IBR, IPC y UVR tienen carry pero no roll-down", () => {
    for (const k of ["IBR", "IPC", "UVR"] as const) {
      const c = carryPosicion(motor, pos(casos.casos[k].entrada as Bono), 6)!;
      expect(c.roll).toBeNull();
      expect(Number.isFinite(c.carry)).toBe(true);
    }
  });

  it("un UVR rinde en pesos más que su TIR real (incluye la inflación de la UVR)", () => {
    const x = pos(casos.casos.UVR.entrada as Bono);
    const c = carryPosicion(motor, x, 12)!;
    expect(c.anual).toBeGreaterThan(x.o.irr);
  });

  it("si el título vence antes del horizonte, se mide hasta el vencimiento", () => {
    const b = { ...(casos.casos.TF.entrada as Bono), vencimiento: "2027-01-20" } as Bono;
    const c = carryPosicion(motor, pos(b), 12)!;
    expect(c.vence).toBe(true);
    expect(c.fecha).toBe("2027-01-20");
  });

  it("el total del portafolio es el promedio ponderado por valor", () => {
    const V = (["TF", "IBR", "IPC", "UVR"] as const).map((k) => pos(casos.casos[k].entrada as Bono));
    const r = carryPortafolio(motor, V);
    const v0 = V.reduce((s, x) => s + x.o.giro, 0);
    const pesos = r.filas.reduce((s, f) => s + f.porH[2]!.pesos, 0);
    expect(r.total[2].total).toBeCloseTo(pesos / v0, 12);
  });
});
