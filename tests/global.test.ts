/* Datos globales: Tesoro de EE. UU. (UST 10A) y spread TES 10A − UST 10A. Sin red (fetch simulado). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eaDesdeSemestral, leerTesoro10, ust10EnFecha } from "@/lib/data/fuentes/tesoro";
import { spreadTesUst } from "@/lib/global";

const entrada = (fecha: string, y10: string) => `
<entry><content type="application/xml"><m:properties>
<d:Id m:type="Edm.Int32">1</d:Id>
<d:NEW_DATE m:type="Edm.DateTime">${fecha}T00:00:00</d:NEW_DATE>
<d:BC_2YEAR m:type="Edm.Double">4.88</d:BC_2YEAR>
<d:BC_10YEAR m:type="Edm.Double">${y10}</d:BC_10YEAR>
</m:properties></content></entry>`;
const XML_NOV = `<feed>${entrada("2026-11-13", "5.15")}${entrada("2026-11-12", "5.10")}${entrada("2026-11-02", "5.02")}</feed>`;
const XML_OCT = `<feed>${entrada("2026-10-16", "4.95")}${entrada("2026-10-30", "4.99")}</feed>`;

afterEach(() => vi.unstubAllGlobals());

describe("Tesoro de EE. UU.", () => {
  it("lee fecha y 10 años de cada día, ordenado", () => {
    expect(leerTesoro10(XML_NOV)).toEqual([
      { fecha: "2026-11-02", valor: 0.0502 },
      { fecha: "2026-11-12", valor: 0.051 },
      { fecha: "2026-11-13", valor: 0.0515 },
    ]);
    expect(leerTesoro10("<feed></feed>")).toEqual([]);
  });

  it("pasa el rendimiento semestral a E.A.", () => {
    expect(eaDesdeSemestral(0.0515)).toBeCloseTo(Math.pow(1.02575, 2) - 1, 15);
  });

  it("toma el último cierre hasta la fecha y, si el mes no tiene, busca en el anterior", async () => {
    const pedidos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        pedidos.push(url);
        const xml = url.endsWith("202611") ? XML_NOV : url.endsWith("202610") ? XML_OCT : "<feed></feed>";
        return new Response(xml, { status: 200 });
      }),
    );
    expect(await ust10EnFecha("2026-11-13")).toEqual({ fecha: "2026-11-13", valor: 0.0515 });
    expect(await ust10EnFecha("2026-11-11")).toEqual({ fecha: "2026-11-02", valor: 0.0502 });
    expect(await ust10EnFecha("2026-11-01")).toEqual({ fecha: "2026-10-30", valor: 0.0499 }); // mes anterior
    expect(await ust10EnFecha("2026-10-16")).toEqual({ fecha: "2026-10-16", valor: 0.0495 });
    expect(pedidos.every((u) => u.startsWith("https://home.treasury.gov/"))).toBe(true);
  });

  it("si el Tesoro falla, el error lo dice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(ust10EnFecha("2026-11-13")).rejects.toThrow(/HTTP 503/);
  });
});

describe("Spread TES 10A − UST 10A", () => {
  const tes = { nombre: "TES TF 2036", tir: 0.1215, plazo: 9.6 };

  it("resta las dos tasas en E.A. y en pb", () => {
    const s = spreadTesUst(tes, { fecha: "2026-10-16", valor: 0.0495 }, "2026-10-16");
    expect(s.ust.ea).toBeCloseTo(eaDesdeSemestral(0.0495), 15);
    expect(s.pb).toBeCloseTo((0.1215 - eaDesdeSemestral(0.0495)) * 1e4, 9);
    expect(s.pb).toBeCloseTo(713.9, 1); // 12,15 % − 5,011 % E.A.
    expect(s.desfase).toBe(false);
  });

  it("avisa si el UST es de otro día que la curva (festivo en EE. UU.)", () => {
    expect(spreadTesUst(tes, { fecha: "2026-10-09", valor: 0.049 }, "2026-10-12").desfase).toBe(true);
  });
});
