/* Compara el motor con los valores esperados del Excel (validacion/casos-prueba.json).
   Tolerancias de CLAUDE.md: 0,001 en precios y 1e-6 en tasas. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import casos from "@/validacion/casos-prueba.json";
import { crearMotor, esError, type Bono, type DatosMercado, type ResultadoValoracion } from "@/lib/engine";

const motor = crearMotor(datos as unknown as DatosMercado);

const PRECIOS = new Set(["dirty", "dirtyV", "clean", "cleanV", "accrued"]);
const TASAS = new Set(["irr", "irrV", "tirReal", "ipcVig", "tirPesos", "ibrVig"]);

function tolerancia(campo: string, esperado: number): number {
  if (PRECIOS.has(campo)) return 1e-3;
  if (TASAS.has(campo)) return 1e-6;
  // duración, convexidad, DV01, UVR: error relativo de 1e-6
  return Math.max(1e-6, Math.abs(esperado) * 1e-6);
}

describe("Casos del Excel", () => {
  for (const [nombre, caso] of Object.entries(casos.casos)) {
    describe(nombre, () => {
      const o = motor.price(caso.entrada as Bono);

      it("valora sin error", () => {
        expect(esError(o) ? o.error : null).toBeNull();
      });

      for (const [campo, esperado] of Object.entries(caso.esperado)) {
        it(`${campo} ≈ ${esperado}`, () => {
          if (esError(o)) throw new Error(o.error);
          const valor = (o as ResultadoValoracion & Record<string, unknown>)[campo];
          expect(typeof valor).toBe("number");
          expect(Math.abs((valor as number) - esperado)).toBeLessThanOrEqual(tolerancia(campo, esperado));
        });
      }
    });
  }
});

describe("Convenciones", () => {
  it("el precio sucio queda truncado a 3 decimales y limpio = sucio − corrido", () => {
    for (const caso of Object.values(casos.casos)) {
      const o = motor.price(caso.entrada as Bono);
      if (esError(o)) throw new Error(o.error);
      expect(Math.round(o.dirty * 1000) / 1000).toBe(o.dirty);
      expect(o.clean).toBe(o.dirty - o.accrued);
    }
  });

  it("rechaza vencimiento anterior a la emisión", () => {
    const b = { ...casos.casos.TF.entrada, vencimiento: "2020-01-01" } as Bono;
    expect(motor.price(b)).toEqual({ error: "El vencimiento debe ser posterior a la emisión" });
  });

  it("rechaza títulos vencidos", () => {
    const b = { ...casos.casos.TF.entrada, valoracion: "2032-01-01" } as Bono;
    expect(motor.price(b)).toEqual({ error: "⚠ El título ya venció" });
  });

  it("valora con aviso si la fecha es anterior a la emisión", () => {
    const b = { ...casos.casos.TF.entrada, valoracion: "2026-10-01" } as Bono;
    const o = motor.price(b);
    if (esError(o)) throw new Error(o.error);
    expect(o.aviso).toBe("⚠ Valoración antes de la emisión");
  });

  it("no modifica los datos de mercado de entrada", () => {
    const copia = JSON.parse(JSON.stringify(datos));
    crearMotor(copia);
    expect(copia).toEqual(JSON.parse(JSON.stringify(datos)));
  });
});
