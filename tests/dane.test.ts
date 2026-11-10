/* IPC del DANE: lectura del anexo «Índices - Serie de empalme», meses a consultar y prioridad
   de la fuente en vivo sobre la carga manual y el Excel. Sin red. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { combinar } from "@/lib/data/combinar";
import { enVentanaDane, fechaActualizado, leerIndicesDane, mesEsperado, mesesCandidatos, urlIndicesDane } from "@/lib/data/fuentes/dane";
import { crearMotor, type DatosMercado } from "@/lib/engine";

const D = datos as unknown as DatosMercado;

/** Hoja como la publica el DANE (recortada a 2025–2026 y a los meses que importan). */
const HOJA: unknown[][] = [
  [null, null, null],
  ["Total, Índice de Precios al Consumidor (IPC)", null, null],
  ["Índices - Serie de empalme\r\n2003 - 2026", null, null],
  [null, null, "Base Diciembre de 2018 = 100,00"],
  ["Mes", 2025, 2026],
  ["Enero", 146.24, 154.07],
  ["Agosto", 150.99, 160.42],
  ["Septiembre", 151.48, 161],
  ["Octubre", 151.76, 161.32],
  ["Noviembre", 151.87, null],
  ["Diciembre", 152.27, null],
  [null, null, null],
  ["Fuente: DANE.", null, null],
  ["Actualizado el 9 de Noviembre de 2026", null, null],
];

describe("Anexo del IPC del DANE", () => {
  it("arma la URL del anexo del mes de referencia", () => {
    expect(urlIndicesDane(2026, 10)).toBe("https://www.dane.gov.co/files/operaciones/IPC/oct2026/anex-IPC-Indices-oct2026.xlsx");
    expect(urlIndicesDane(2026, 9)).toContain("/sep2026/anex-IPC-Indices-sep2026.xlsx");
  });

  it("lee la fecha de actualización", () => {
    expect(fechaActualizado("Actualizado el 9 de Noviembre de 2026")).toBe("2026-11-09");
    expect(fechaActualizado("Fuente: DANE.")).toBeNull();
  });

  it("convierte la tabla meses × años en una serie mensual a fin de mes", () => {
    const { serie, publicado } = leerIndicesDane(HOJA);
    expect(publicado).toBe("2026-11-09");
    expect(serie[0]).toEqual(["2025-01-31", 146.24, null, null]);
    const ult = serie[serie.length - 1];
    expect(ult).toEqual(["2026-10-31", 161.32, null, "2026-11-09"]);
    expect(serie.some((r) => r[0] === "2026-11-30")).toBe(false); // celdas vacías no entran
    // Octubre de 2026: 6,30 % anual
    const oct25 = serie.find((r) => r[0] === "2025-10-31")!;
    expect((ult[1] / oct25[1] - 1) * 100).toBeCloseTo(6.3, 2);
  });

  it("rechaza una hoja sin encabezado", () => {
    expect(() => leerIndicesDane([["otra cosa"]])).toThrow(/Mes/);
  });

  it("prueba primero el mes anterior y sabe cuándo es temporada de publicación", () => {
    expect(mesesCandidatos("2026-11-09")).toEqual([
      [2026, 10],
      [2026, 9],
      [2026, 8],
    ]);
    expect(mesesCandidatos("2027-01-05", 2)).toEqual([
      [2026, 12],
      [2026, 11],
    ]);
    expect(mesEsperado("2026-11-09")).toBe("2026-10");
    expect(enVentanaDane("2026-11-09")).toBe(true);
    expect(enVentanaDane("2026-11-20")).toBe(false);
  });
});

describe("Prioridad de fuentes del IPC", () => {
  const { serie } = leerIndicesDane(HOJA);
  const sinCargas = { indice: { frac: [], series: {} }, series: {} };

  it("el DANE en vivo agrega octubre y prevalece mes a mes sobre el Excel", () => {
    const { datos: dm, fuentes } = combinar(D, { ipc: { serie, publicado: "2026-11-09", consultado: "2026-11-09 20:30" }, errores: {} }, sinCargas);
    const ult = dm.ipc[dm.ipc.length - 1];
    expect(ult[0]).toBe("2026-10-31");
    expect(ult[1]).toBe(161.32);
    expect(dm.ipc.find((r) => r[0] === "2026-09-30")?.[1]).toBe(161); // dato oficial sobre el estimado del Excel
    expect(dm.ipc.find((r) => r[0] === "2024-10-31")).toBeTruthy(); // lo anterior al anexo sigue del Excel
    expect(fuentes.ipc).toMatchObject({ estado: "en-vivo", hasta: "2026-10-31", consultado: "2026-11-09 20:30" });

    const M = crearMotor(dm).mercado;
    expect(M.ipcV[M.ipcV.length - 1].annual).toBeCloseTo(0.063, 4);
  });

  it("la carga manual queda como respaldo del DANE", () => {
    const carga = {
      indice: { frac: [], series: {} },
      series: { ipc: { tipo: "ipc" as const, origen: "manual.xlsx", cargada: "", datos: [["2026-10-31", 161.5]] as [string, number][] } },
    };
    const conDane = combinar(D, { ipc: { serie, publicado: null, consultado: "2026-11-09 20:30" }, errores: {} }, carga);
    expect(conDane.datos.ipc.find((r) => r[0] === "2026-10-31")?.[1]).toBe(161.32);
    const sinDane = combinar(D, { errores: { ipc: "DANE IPC: anexo no disponible" } }, carga);
    expect(sinDane.datos.ipc.find((r) => r[0] === "2026-10-31")?.[1]).toBe(161.5);
    expect(sinDane.fuentes.ipc).toMatchObject({ estado: "cargado", detalle: "DANE IPC: anexo no disponible" });
  });

  it("si el DANE no responde, usa la última lectura guardada y lo dice", () => {
    const { fuentes } = combinar(D, { ipc: { serie, publicado: null, consultado: "2026-11-09 12:01", guardado: true }, errores: { ipc: "timeout" } }, sinCargas);
    expect(fuentes.ipc).toMatchObject({ fuente: "DANE · última lectura guardada", estado: "respaldo", consultado: "2026-11-09 12:01" });
  });

  it("sin DANE ni carga, el Excel del curso", () => {
    const { datos: dm, fuentes } = combinar(D, { errores: {} }, sinCargas);
    expect(dm.ipc).toBe(D.ipc);
    expect(fuentes.ipc?.estado).toBe("respaldo");
  });
});
