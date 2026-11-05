/* Prueba de equivalencia: el motor en TypeScript debe dar EXACTAMENTE los mismos números
   (bit a bit) que prototipo/engine.js para cientos de títulos generados al azar
   (semilla fija), incluidos el cronograma, la sensibilidad y la venta anticipada. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import {
  crearMotor,
  edate,
  esError,
  toN,
  toS,
  type Base,
  type Bono,
  type DatosMercado,
  type Frecuencia,
} from "@/lib/engine";

/* ---------- Motor original ---------- */
const codigo = readFileSync(fileURLToPath(new URL("../prototipo/engine.js", import.meta.url)), "utf8");
const ctx: Record<string, unknown> = {};
vm.createContext(ctx);
vm.runInContext(codigo, ctx);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viejo = ctx.BondEngine as any;
viejo.load(JSON.parse(JSON.stringify(datos)));

const nuevo = crearMotor(datos as unknown as DatosMercado);

/* ---------- Comparación profunda (ignora claves internas "_…" del prototipo) ---------- */
function comparar(a: unknown, b: unknown, ruta: string, dif: string[]) {
  if (dif.length > 5) return;
  if (typeof a === "number") {
    if (!(a === b || (Number.isNaN(a) && Number.isNaN(b as number)))) dif.push(`${ruta}: ${a} ≠ ${b}`);
    return;
  }
  if (a === null || typeof a !== "object") {
    if (a !== b) dif.push(`${ruta}: ${String(a)} ≠ ${String(b)}`);
    return;
  }
  if (b === null || typeof b !== "object") {
    dif.push(`${ruta}: falta en el motor nuevo`);
    return;
  }
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) dif.push(`${ruta}.length: ${a.length} ≠ ${bb.length}`);
    a.forEach((x, i) => comparar(x, bb[i], `${ruta}[${i}]`, dif));
    return;
  }
  for (const k of Object.keys(a)) {
    if (k.startsWith("_")) continue;
    comparar((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${ruta}.${k}`, dif);
  }
}

/* ---------- Generador de títulos al azar ---------- */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261105);
const entre = (a: number, b: number) => a + (b - a) * rnd();
const entero = (a: number, b: number) => Math.floor(entre(a, b + 1));
const elegir = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const redondear = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

const FRECUENCIAS: Frecuencia[] = ["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"];
const BASES: Base[] = ["365/365", "Real/365", "30/360", "Real/360"];

function bonoAlAzar(tipo: Bono["tipo"]): Bono {
  const em = Math.round(entre(toN("2019-01-01"), toN("2027-03-31")));
  const meses = entero(6, 180);
  // a veces vencimiento a fin de mes o desfasado de la emisión
  const mat = rnd() < 0.8 ? edate(em, meses) : edate(em, meses) + entero(-20, 20);
  // valoración: casi siempre vigente, a veces antes de emisión o después del vencimiento
  const val = Math.round(entre(em - 40, mat + 40));
  const comun = {
    nombre: "Prueba",
    nominal: elegir([1e6, 5e9, 1e10, 123456789]),
    emision: toS(em),
    vencimiento: toS(mat),
    frecuencia: elegir(FRECUENCIAS),
    base: elegir(BASES),
    valoracion: toS(val),
  };
  const corrido = elegir(["Lineal", "Compuesto"] as const);
  const proyeccion = elegir(["IPC vigente", "Expectativas"] as const);
  switch (tipo) {
    case "TF":
      return {
        ...comun,
        tipo,
        cupon: redondear(entre(0, 0.16), 5),
        tasaCompra: redondear(entre(0.01, 0.2), 5),
        tasaVenta: redondear(entre(0.01, 0.2), 5),
        corrido,
      };
    case "UVR":
      return {
        ...comun,
        tipo,
        cupon: redondear(entre(0, 0.06), 5),
        tasaCompra: redondear(entre(0, 0.08), 5),
        tasaVenta: redondear(entre(0, 0.08), 5),
        corrido,
        proyeccion,
      };
    case "IPC": {
      const spreadCompra = redondear(entre(0, 0.09), 5);
      return {
        ...comun,
        tipo,
        spread: redondear(entre(0, 0.09), 5),
        spreadCompra,
        spreadVenta: rnd() < 0.1 ? spreadCompra : redondear(entre(0, 0.09), 5),
        modalidad: elegir(["Inicio (Previo)", "Final (Actual)"] as const),
        proyeccion,
        corrido,
      };
    }
    case "IBR": {
      const spreadCompra = redondear(entre(0, 0.04), 5);
      return {
        ...comun,
        tipo,
        spread: redondear(entre(0, 0.04), 5),
        spreadCompra,
        spreadVenta: rnd() < 0.1 ? spreadCompra : redondear(entre(0, 0.04), 5),
        metodologia: elegir(["IBR vigente", "Curva FRAC"] as const),
        descuento: elegir(["TIR con IBR promedio", "Encadenado por periodo"] as const),
        precioDado: rnd() < 0.2 ? redondear(entre(90, 110), 3) : 0,
      };
    }
  }
}

const POR_TIPO = 250;

describe("Equivalencia con prototipo/engine.js", () => {
  for (const tipo of ["TF", "IPC", "UVR", "IBR"] as const) {
    it(`${tipo}: ${POR_TIPO} títulos al azar dan resultados idénticos`, () => {
      let valorados = 0,
        ventas = 0;
      for (let k = 0; k < POR_TIPO; k++) {
        const b = bonoAlAzar(tipo);
        const oV = viejo.price(JSON.parse(JSON.stringify(b)));
        const oN = nuevo.price(b);
        const dif: string[] = [];
        comparar(oV, oN, "price", dif);
        if (!esError(oN)) {
          valorados++;
          // venta anticipada en una fecha entre la valoración y el vencimiento
          const val = toN(b.valoracion),
            mat = toN(b.vencimiento);
          const sv = toS(Math.round(entre(val - 5, mat + 5)));
          const tasa = redondear(entre(0.01, 0.2), 4);
          const hV = viejo.holding(b, oV, sv, tasa);
          const hN = nuevo.holding(b, oN, sv, tasa);
          if (!esError(hN)) ventas++;
          comparar(hV, hN, "holding", dif);
        }
        expect(dif, `Título ${k}: ${JSON.stringify(b)}`).toEqual([]);
      }
      // que la muestra sí ejercite la valoración, no solo errores
      expect(valorados).toBeGreaterThan(POR_TIPO * 0.8);
      expect(ventas).toBeGreaterThan(POR_TIPO * 0.5);
    });
  }

  it("series de mercado idénticas en fechas al azar", () => {
    for (let k = 0; k < 500; k++) {
      const n = Math.round(entre(toN("2020-06-01"), toN("2030-12-31")));
      const t = entre(0, 35);
      const col = entero(1, 5);
      const dif: string[] = [];
      comparar(viejo.spot(t), nuevo.spot(t), "spot", dif);
      comparar(viejo.ipcVigente(n), nuevo.ipcVigente(n), "ipcVigente", dif);
      comparar(viejo.uvrAt(n), nuevo.uvrAt(n), "uvrAt", dif);
      comparar(viejo.ibrPub(n, col), nuevo.ibrPub(n, col), "ibrPub", dif);
      comparar(viejo.expect(n), nuevo.expect(n), "expect", dif);
      expect(dif, `n=${toS(n)} t=${t}`).toEqual([]);
    }
  });
});
