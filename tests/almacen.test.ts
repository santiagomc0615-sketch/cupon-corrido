/* Guardado local de cargas + combinación con el respaldo, como lo hace el servidor. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import datos from "@/data/datos-mercado.json";
import type { CargaFRAC } from "@/lib/cargas/tipos";
import { crearMotor, esError, toN, toS, type BonoIBR, type DatosMercado } from "@/lib/engine";

vi.mock("server-only", () => ({}));

const D = datos as unknown as DatosMercado;
let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "cupon-cargas-"));
  process.env.CARGAS_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CARGAS_DIR;
});

const curva = (id: string, nombre: string, fechaBase: string, pb: number): CargaFRAC => {
  const n0 = toN(fechaBase);
  const datosC = Array.from({ length: 4000 }, (_, i) => [toS(n0 + i), 0.1 + pb / 1e4] as [string, number]);
  return { tipo: "frac", id, nombre, fechaBase, filas: datosC.length, origen: "prueba.xlsx · Curva_FRAC", cargada: "2026-11-05T00:00:00Z", datos: datosC };
};

describe("Almacén local de cargas y combinación", () => {
  it("guarda dos curvas FRAC y una serie, y el índice no lleva los datos de las curvas", async () => {
    const { guardarCarga, leerCargas, leerCurvaFrac } = await import("@/lib/data/almacen");
    await guardarCarga(curva("frac-2026-11-05-aaaaaa", "Compra", "2026-11-05", 0));
    await guardarCarga(curva("frac-2027-05-05-bbbbbb", "Venta", "2027-05-05", -50));
    await guardarCarga({ tipo: "ibr12", origen: "prueba.xlsx · Datos_IBR", cargada: "", datos: [["2026-11-04", 0.123], ["2026-11-05", 0.124]] });
    const c = await leerCargas();
    expect(c.indice.frac.map((x) => x.nombre)).toEqual(["Venta", "Compra"]); // más reciente primero
    expect(c.indice.frac.every((x) => !("datos" in x))).toBe(true);
    expect(c.series.ibr12?.datos.length).toBe(2);
    expect((await leerCurvaFrac("frac-2026-11-05-aaaaaa"))?.datos.length).toBe(4000);
  });

  it("combina: IBR 12M cargado y curvas disponibles para el motor", async () => {
    const { leerCargas, leerCurvaFrac } = await import("@/lib/data/almacen");
    const { combinar } = await import("@/lib/data/combinar");
    const c = await leerCargas();
    const vivo = { ibr: [["2026-11-05", 11.4, 11.47, 11.63, 11.85]] as [string, number, number, number, number][], errores: {} };
    const { datos: dm, fuentes } = combinar(D, vivo, c);
    const ult = dm.ibr[dm.ibr.length - 1];
    expect(ult[0]).toBe("2026-11-05");
    expect(ult[5]).toBeCloseTo(12.4, 10); // IBR 12M cargado (en %)
    expect(fuentes.ibr?.estado).toBe("en-vivo");
    expect(fuentes.ibr12?.estado).toBe("cargado");
    expect(fuentes.frac?.estado).toBe("cargado");

    // El motor recibe la curva descargada y valora con ella
    const compra = await leerCurvaFrac("frac-2026-11-05-aaaaaa");
    const motor = crearMotor({ ...dm, curvasFrac: dm.curvasFrac!.map((x) => (x.id === compra!.id ? { ...x, datos: compra!.datos } : x)) });
    const b: BonoIBR = { tipo: "IBR", nominal: 5e9, emision: "2025-09-15", vencimiento: "2028-09-15", spread: 0.018, frecuencia: "Trimestral", base: "30/360", valoracion: "2026-11-05", spreadCompra: 0.017, spreadVenta: 0.019, metodologia: "Curva FRAC", descuento: "Encadenado por periodo" };
    const o = motor.price(b);
    if (esError(o)) throw new Error(o.error);
    expect(o.tipo === "IBR" && o.curvaFracNombre).toBe("Compra");
    expect(o.tipo === "IBR" && o.fracStale).toBe(false);
  });

  it("elimina y renombra curvas", async () => {
    const { eliminarCarga, leerIndice, renombrarCurva } = await import("@/lib/data/almacen");
    await renombrarCurva("frac-2027-05-05-bbbbbb", "Venta junio");
    await eliminarCarga("frac", "frac-2026-11-05-aaaaaa");
    await eliminarCarga("ibr12");
    const i = await leerIndice();
    expect(i.frac.map((x) => x.nombre)).toEqual(["Venta junio"]);
    expect(i.series.ibr12).toBeUndefined();
  });
});
