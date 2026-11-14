/* Última lectura buena del BanRep: se guarda serie por serie y se usa (marcada) cuando el BanRep falla. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import datos from "@/data/datos-mercado.json";
import { combinar } from "@/lib/data/combinar";
import type { DatosMercado } from "@/lib/engine";

vi.mock("server-only", () => ({}));

const D = datos as unknown as DatosMercado;
const sinCargas = { indice: { frac: [], series: {} }, series: {} };
let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "cupon-banrep-"));
  process.env.CARGAS_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CARGAS_DIR;
});

describe("Almacén de la última lectura del BanRep", () => {
  it("guarda lo que llegó y conserva lo anterior de lo que falló", async () => {
    const { guardarBanRep, leerBanRep } = await import("@/lib/data/almacen");
    expect(await leerBanRep()).toEqual({});
    await guardarBanRep({
      tpm: { serie: [["2026-11-13", 12.25]], consultado: "2026-11-13 12:00" },
      ibr: { serie: [["2026-11-13", 11.41, 11.47, 11.63, 11.85]], consultado: "2026-11-13 12:00" },
    });
    // Al día siguiente solo responde la TPM: el IBR guardado no se pierde.
    await guardarBanRep({ tpm: { serie: [["2026-11-14", 12.25]], consultado: "2026-11-14 12:00" } });
    const g = await leerBanRep();
    expect(g.tpm?.consultado).toBe("2026-11-14 12:00");
    expect(g.ibr?.consultado).toBe("2026-11-13 12:00");
    await guardarBanRep({}); // nada nuevo: no toca el archivo
    expect((await leerBanRep()).tpm?.serie).toEqual([["2026-11-14", 12.25]]);
  });
});

describe("Combinación con lecturas guardadas", () => {
  const ibr: [string, number, number, number, number][] = [["2026-11-13", 11.41, 11.47, 11.63, 11.85]];
  const uvr: [string, number][] = [["2026-11-13", 421.1]];

  it("en vivo: BanRep · SDMX", () => {
    const { fuentes } = combinar(D, { ibr, uvr, errores: {} }, sinCargas);
    expect(fuentes.ibr).toMatchObject({ fuente: "BanRep · SDMX", estado: "en-vivo", hasta: "2026-11-13" });
    expect(fuentes.uvr?.estado).toBe("en-vivo");
  });

  it("si el BanRep falla, usa la lectura guardada, la marca y dice por qué", () => {
    const { datos: dm, fuentes } = combinar(
      D,
      { ibr, uvr, guardados: { ibr: "2026-11-13 12:00", uvr: "2026-11-13 12:00" }, errores: { ibr: "BanRep SDMX DF_IBR_DAILY_HIST: HTTP 500", uvr: "HTTP 500" } },
      sinCargas,
    );
    expect(dm.ibr[dm.ibr.length - 1][0]).toBe("2026-11-13"); // el dato guardado sí entra a los cálculos
    expect(fuentes.ibr).toMatchObject({
      fuente: "BanRep · última lectura guardada",
      estado: "respaldo",
      consultado: "2026-11-13 12:00",
      detalle: "BanRep SDMX DF_IBR_DAILY_HIST: HTTP 500",
    });
    expect(fuentes.uvr?.fuente).toBe("BanRep · última lectura guardada");
  });

  it("sin lectura guardada, el Excel del curso como antes", () => {
    const { fuentes } = combinar(D, { errores: { ibr: "HTTP 500" } }, sinCargas);
    expect(fuentes.ibr).toMatchObject({ fuente: "Excel del curso", estado: "respaldo", detalle: "HTTP 500" });
  });
});
