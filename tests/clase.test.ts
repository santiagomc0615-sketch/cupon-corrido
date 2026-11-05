/* Modo clase: cada explicación debe llegar exactamente al número que calculó el motor. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import casos from "@/validacion/casos-prueba.json";
import { explicar, type ClaveClase } from "@/lib/clase";
import { crearMotor, esError, trunc3, type Bono, type DatosMercado } from "@/lib/engine";

const motor = crearMotor(datos as unknown as DatosMercado);
const CLAVES: ClaveClase[] = ["dirty", "accrued", "clean", "irr", "mac", "mod", "dv01", "conv", "giro"];

describe("Modo clase", () => {
  for (const [nombre, caso] of Object.entries(casos.casos)) {
    const b = caso.entrada as Bono;
    const o = motor.price(b);
    if (esError(o)) throw new Error(o.error);

    it(`${nombre}: todas las explicaciones llegan al valor del motor`, () => {
      for (const k of CLAVES) {
        const e = explicar(k, b, o);
        expect(e.resultado, k).toBe((o as unknown as Record<string, number>)[k]);
        expect(e.pasos.length, k).toBeGreaterThan(0);
        expect(e.formula, k).toBeTruthy();
      }
    });

    it(`${nombre}: la tabla del precio sucio suma lo mismo que el motor (antes de truncar)`, () => {
      const suma = o.rows.filter((r) => r.N > 0).reduce((s, r) => s + r.vp, 0);
      if (!(b.tipo === "IBR" && (b.precioDado ?? 0) > 0)) expect(trunc3(suma)).toBe(o.dirty);
      expect(explicar("dirty", b, o).tabla?.filas.length).toBe(o.rows.filter((r) => r.N > 0).length);
    });

    it(`${nombre}: Macaulay recalculado desde la tabla coincide`, () => {
      let s = 0,
        st = 0;
      for (const f of o.flows) {
        const vp = f.cf / Math.pow(1 + o.irr, f.t);
        s += vp;
        st += f.t * vp;
      }
      expect(Math.abs(st / s - o.mac)).toBeLessThan(1e-12);
    });
  }
});
