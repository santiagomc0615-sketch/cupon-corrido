/* Buscar objetivo: solver (Brent), recuperación de valores conocidos y casos de referencia del parcial.
   lib/engine no cambia: lib/objetivo solo llama al motor. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { filasCSV } from "@/lib/cargas/leer";
import { conDatosUsuario, ID_CURVA_USUARIO } from "@/lib/cargas-usuario/datos";
import { analizarArchivo, leerSerie } from "@/lib/cargas-usuario/lector";
import { crearDefaults, toEngine, type EntradasUI } from "@/lib/calculadora";
import { CONFIG_INICIAL } from "@/lib/carry/config";
import { crearMotor, esError, type DatosMercado } from "@/lib/engine";
import { buscarObjetivo, evaluar, type ContextoObjetivo, type Problema } from "@/lib/objetivo/objetivo";
import { acotar, brent, resolver } from "@/lib/objetivo/solver";

const D = datos as unknown as DatosMercado;
const motor = crearMotor(D);
const ctx: ContextoObjetivo = { motor };
const def = crearDefaults("2026-11-18");
const precioDe = (e: EntradasUI) => {
  const o = motor.price(toEngine(e));
  if (esError(o)) throw new Error(o.error);
  return o;
};
const resolverOk = (c: ContextoObjetivo, p: Problema) => {
  const r = buscarObjetivo(c, p);
  if (!r.ok) throw new Error(r.mensaje);
  return r;
};

describe("Solver de Brent", () => {
  it("encuentra raíces con tolerancia 1e-8", () => {
    const r = brent((x) => x * x - 2, 0, 2);
    expect(r?.x).toBeCloseTo(Math.SQRT2, 8);
    expect(Math.abs(r!.fx)).toBeLessThan(1e-7);
    expect(brent((x) => Math.cos(x) - x, 0, 1)?.x).toBeCloseTo(0.7390851332, 8);
  });

  it("sin cambio de signo no inventa una raíz; con varias elige la más cercana", () => {
    expect(brent((x) => x * x + 1, -1, 1)).toBeNull();
    expect(acotar((x) => (x - 1) * (x - 5), -2, 8, 4.5)).toEqual(expect.arrayContaining([expect.any(Number)]));
    const r = resolver((x) => (x - 1) * (x - 5), -2, 8, 4.5);
    expect(r.ok && r.raiz.x).toBeCloseTo(5, 8);
    const sin = resolver((x) => x * x + 1, -3, 3);
    expect(!sin.ok && sin.motivo).toBe("sin-cambio-de-signo");
    expect(!sin.ok && sin.minimo).toBeCloseTo(1, 2);
    const cte = resolver(() => 3, 0, 1);
    expect(!cte.ok && cte.motivo).toBe("constante");
    // puntos donde la función falla se saltan
    expect(resolver((x) => (x < 0.5 ? NaN : x - 0.7), 0, 1).ok).toBe(true);
  });
});

describe("Recupera valores conocidos (el motor es la referencia)", () => {
  it("con la tasa de compra actual del TES TF 2031 devuelve su precio sucio exacto", () => {
    const o = precioDe(def.TF);
    const r = resolverOk(ctx, { entradas: { ...def.TF, tasaCompra: 10 }, resultado: "sucio", objetivo: o.dirty, variable: "tasaCompra" });
    // el precio está truncado a 3 decimales: cualquier tasa del escalón da el mismo precio exacto
    expect(r.eval.o.dirty).toBe(o.dirty);
    expect(r.x).toBeCloseTo(Number(def.TF.tasaCompra), 3);
    // y al revés: la tasa de compra de la calculadora devuelve su precio sucio (a 6 decimales)
    const t = resolverOk(ctx, { entradas: def.TF, resultado: "tir", objetivo: Number(def.TF.tasaCompra), variable: "precioCompra" });
    expect(t.x).toBeCloseTo(o.dirty, 6);
    expect(t.eval.o.dirty).toBe(o.dirty);
  });

  it("IPC: el spread de compra que da la TIR actual es el de la calculadora", () => {
    const o = precioDe(def.IPC);
    const r = resolverOk(ctx, { entradas: { ...def.IPC, spreadCompra: 3 }, resultado: "tir", objetivo: o.irr * 100, variable: "spreadCompra" });
    // la TIR sale del precio truncado a 3 decimales: el spread se recupera a 3 decimales (0,001 %)
    expect(r.x).toBeCloseTo(Number(def.IPC.spreadCompra), 3);
    expect(r.eval.o.dirty).toBe(o.dirty);
  });

  it("UVR: la tasa de compra que da la TIR en pesos actual; TIR real = tasa de compra", () => {
    const o = precioDe(def.UVR);
    const r = resolverOk(ctx, { entradas: { ...def.UVR, tasaCompra: 3 }, resultado: "tir", objetivo: o.yieldCOP * 100, variable: "tasaCompra" });
    expect(r.x).toBeCloseTo(Number(def.UVR.tasaCompra), 3);
    expect(r.eval.o.dirty).toBe(o.dirty);
    const real = resolverOk(ctx, { entradas: def.UVR, resultado: "tirReal", objetivo: 6, variable: "tasaCompra" });
    expect(real.x).toBeCloseTo(6, 8);
  });

  it("IBR: con precio dado, el spread facial que da la TIR del motor", () => {
    const e = { ...def.IBR, precioDado: 100 };
    const o = precioDe(e);
    const r = resolverOk(ctx, { entradas: { ...e, spread: 0.5 }, resultado: "tir", objetivo: o.irr * 100, variable: "spreadFacial" });
    expect(r.x).toBeCloseTo(Number(def.IBR.spread), 6);
  });

  it("nominal para un valor de giro dado", () => {
    const o = precioDe(def.TF);
    const r = resolverOk(ctx, { entradas: def.TF, resultado: "giro", objetivo: 5e9, variable: "nominal" });
    expect(r.x).toBeCloseTo(5e9 / (o.dirty / 100), 0);
    expect(r.eval.valor).toBeCloseTo(5e9, 2);
  });

  it("verificación y cambios para aplicar a la calculadora", () => {
    const r = resolverOk(ctx, { entradas: def.IPC, resultado: "tir", objetivo: 13, variable: "spreadFacial", aLaPar: true });
    expect(r.verificacion).toMatch(/^Con IPC \+ \d+,\d{3} %, la TIR da 13,000 % E\.A\.$/);
    expect(r.eval.valor).toBeCloseTo(13, 3);
    expect(r.cambios).toMatchObject({ emision: "2026-11-18", spread: expect.any(Number), spreadCompra: expect.any(Number) });
    expect(r.cambios.spread).toBe(r.cambios.spreadCompra);
    expect(r.flujos.length).toBeGreaterThan(0);
    // la suma de los VP a la TIR de la respuesta es el precio
    expect(r.flujos.reduce((s, f) => s + f.vp, 0)).toBeCloseTo(r.eval.o.dirty, 6);
  });

  it("sin solución en un rango razonable lo explica en lenguaje simple", () => {
    const r = buscarObjetivo(ctx, { entradas: def.TF, resultado: "sucio", objetivo: 900, variable: "tasaCompra" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.mensaje).toMatch(/No hay solución en un rango razonable: con tasa de compra entre -5 % y 60 %, el precio sucio va de .* y nunca llega a 900,000 %/);
    const c = buscarObjetivo(ctx, { entradas: def.TF, resultado: "tir", objetivo: 12, variable: "nominal" });
    expect(!c.ok && c.mensaje).toBe("La TIR no depende de nominal: cambie otra variable.");
    expect(buscarObjetivo(ctx, { entradas: def.TF, resultado: "rentVenta", objetivo: 12, variable: "tasaCompra" }).ok).toBe(false);
  });

  it("rentabilidad de la venta y ROE con fondeo", () => {
    const venta = { fecha: "2027-11-18", tasa: 11 };
    const r = resolverOk({ motor, venta }, { entradas: def.TF, resultado: "rentVenta", objetivo: 15, variable: "tasaCompra" });
    expect(r.eval.valor).toBeCloseTo(15, 3);
    const mercado = { sofr: 0.039, spot: 3316.7, tpm: 0.0925, ibr: null };
    const f = { motor, fondeo: { config: { ...CONFIG_INICIAL, tipo: "repo" as const, tasa: 0.09, haircut: 0.2 }, mercado, horizonte: 90 } };
    const roe = resolverOk(f as ContextoObjetivo, { entradas: def.TF, resultado: "roe", objetivo: 5, variable: "tasaCompra" });
    expect(roe.eval.valor).toBeCloseTo(5, 3);
  });
});

/* ---------- caso de referencia del parcial (curva FRA IBR del 17-11-2026) ---------- */
const ARCHIVO = path.join(process.cwd(), "datos", "frac", "curva_frac_2026-11-17.csv");

describe.skipIf(!existsSync(ARCHIVO))("Referencia: IBR trimestral a la par, 2026-11-18 a 2028-05-18, objetivo 13 % E.A.", () => {
  const { filas, comaDecimal } = filasCSV(existsSync(ARCHIVO) ? readFileSync(ARCHIVO, "utf8") : "");
  const { analisis, sugerida } = analizarArchivo([{ hoja: "csv", filas }], "frac", comaDecimal);
  const r = leerSerie(filas, analisis[0], sugerida.colFecha, sugerida.colValor, "frac", comaDecimal);
  const datosFrac = r.ok ? r.serie.datos : [];
  const m = crearMotor(conDatosUsuario(D, { frac: { tipo: "frac", datos: datosFrac, archivo: "curva_frac_2026-11-17.csv", cargada: "2026-11-18T12:00:00Z", fechaCurva: "2026-11-17" } }));
  const bono = (base: string): EntradasUI => ({
    ...def.IBR,
    emision: "2026-11-18",
    valoracion: "2026-11-18",
    vencimiento: "2028-05-18",
    frecuencia: "Trimestral",
    base,
    metodologia: "Curva FRAC",
    curvaFrac: ID_CURVA_USUARIO,
  });
  const spread = (base: string, convencionClase: boolean) =>
    resolverOk(
      { motor: m },
      { entradas: bono(base), resultado: convencionClase ? "tirXirr" : "tir", objetivo: 13, variable: "spreadFacial", aLaPar: true, primerPeriodoFRA: convencionClase },
    );

  it.each([
    ["30/360", 1.27],
    ["Real/360", 1.11],
    ["Real/365", 1.28],
  ])("cupón = (FRA del inicio + spread) × días/base y TIR con días reales/365: base %s → spread ≈ %s %%", (base, esperado) => {
    const s = spread(base, true);
    expect(Math.abs(s.x - esperado)).toBeLessThan(0.02);
    // todos los periodos con la FRA de su fecha de inicio; el primero, la del 18-11-2026
    expect(s.flujos.every((f) => f.fuente === "FRAC")).toBe(true);
    expect(s.flujos[0].indice! / 100).toBeCloseTo(0.11166, 5);
    expect(s.eval.valor).toBeCloseTo(13, 6);
  });

  it("con la convención del motor (Excel) el resultado difiere y se explica", () => {
    // El motor proyecta con el IBR publicado el periodo que empieza el día de la valoración (11,546 %)
    // y mide la TIR con el tiempo en la base del título: el spread casi no depende de la base (≈ 1,21 %).
    for (const base of ["30/360", "Real/360", "Real/365"]) {
      const s = spread(base, false);
      expect(s.flujos[0].fuente).toBe("Publicado");
      expect(s.x).toBeGreaterThan(1.2);
      expect(s.x).toBeLessThan(1.22);
    }
  });

  it("evaluar con el spread de la respuesta da 13 % (verificación)", () => {
    const s = spread("30/360", true);
    const p: Problema = { entradas: bono("30/360"), resultado: "tirXirr", objetivo: 13, variable: "spreadFacial", aLaPar: true, primerPeriodoFRA: true };
    expect(evaluar({ motor: m }, p, s.x).valor).toBeCloseTo(13, 7);
    expect(s.verificacion).toMatch(/^Con IBR \+ 1,2\d\d %, la TIR \(XIRR\) da 13,000 % E\.A\.$/);
  });
});

/* ---------- plantillas del parcial ---------- */
import { resolverPlantilla, type DatosPlantilla, type Fuentes } from "@/lib/objetivo/plantillas";
import { pasoAPaso } from "@/lib/objetivo/pasos";

describe("Preguntas rápidas del parcial", () => {
  const defs = def as unknown as Record<string, EntradasUI>;
  const fuentes: Fuentes = { frac: "Excel del curso (Curva_FRAC)", exp: "Encuesta del BanRep", fracUsuario: false };
  const base: DatosPlantilla = { fecha: "2026-11-18", vencimiento: "2028-05-18", frecuencia: "Trimestral", base: "365/365", modalidad: "Inicio (Previo)", objetivo: 13 };

  it("a) spread sobre IPC para rentar 13 %: respuesta, convenciones y sensibilidad base × modalidad", () => {
    const r = resolverPlantilla("ipcSpread", ctx, defs, base, fuentes);
    expect(r.respuesta.ok).toBe(true);
    if (!r.respuesta.ok) return;
    expect(r.titular).toMatch(/^IPC \+ \d+,\d{3} %$/);
    expect(r.respuesta.eval.valor).toBeCloseTo(13, 3);
    expect(r.convenciones.map((c) => c[0])).toEqual(expect.arrayContaining(["Base", "Frecuencia", "Modalidad del IPC", "Proyección del IPC"]));
    expect(r.sensibilidad?.filas).toHaveLength(4);
    expect(r.sensibilidad?.columnas).toEqual(["Inicio (Previo)", "Final (Actual)"]);
    const fila = r.sensibilidad!.filas.find((f) => f.actual)!;
    expect(fila.valores[0]).toBeCloseTo(r.respuesta.x, 6);
  });

  it("c) tasa fija equivalente: la TIR del IPC + s a la par, y resolver al revés devuelve s", () => {
    const r = resolverPlantilla("tasaFija", ctx, defs, { ...base, tipo: "IPC", spread: 6 }, fuentes);
    expect(r.respuesta.ok).toBe(true);
    if (!r.respuesta.ok) return;
    expect(r.respuesta.x).toBeCloseTo(6, 3);
    expect(r.titular).toMatch(/ E\.A\.$/);
  });

  it("d) precio máximo para rentar 13 %: el precio sucio del TES a esa tasa", () => {
    const r = resolverPlantilla("precioMaximo", ctx, defs, { ...base, titulo: def.TF }, fuentes);
    expect(r.respuesta.ok && r.respuesta.eval.o.dirty).toBe(precioDe({ ...def.TF, tasaCompra: 13 }).dirty);
    expect(r.extras[0][0]).toBe("Valor de giro máximo");
  });

  it("e) nominal para un giro de $ 1.000 millones", () => {
    const r = resolverPlantilla("nominalGiro", ctx, defs, { ...base, objetivo: 1e9, titulo: def.TF }, fuentes);
    expect(r.respuesta.ok && r.respuesta.eval.valor).toBeCloseTo(1e9, 0);
  });

  it("paso a paso: fórmulas, ecuación resuelta y método", () => {
    const r = resolverPlantilla("ipcSpread", ctx, defs, base, fuentes);
    if (!r.respuesta.ok) throw new Error();
    const p = pasoAPaso(r.problema, r.respuesta);
    expect(p.formulas.map((f) => f[0])).toEqual(expect.arrayContaining(["Tasa del periodo j", "Cupón del periodo j", "Precio sucio"]));
    expect(p.ecuacion).toMatch(/^f\(s\) = TIR E\.A\.\(s\) − 13,000 % = 0  →  s = /);
    expect(p.sustitucion).toMatch(/^\d+,\d{3} = /);
    expect(p.metodo).toMatch(/Brent.*tolerancia 1×10\^-8; \d+ iteraciones/);
  });
});

describe.skipIf(!existsSync(ARCHIVO))("b) spread sobre IBR con la curva FRAC del 17-11-2026", () => {
  it("convención de clase: 1,27 % en 30/360 y la tabla muestra las otras convenciones", () => {
    const { filas, comaDecimal } = filasCSV(readFileSync(ARCHIVO, "utf8"));
    const { analisis, sugerida } = analizarArchivo([{ hoja: "csv", filas }], "frac", comaDecimal);
    const lr = leerSerie(filas, analisis[0], sugerida.colFecha, sugerida.colValor, "frac", comaDecimal);
    if (!lr.ok) throw new Error();
    const m = crearMotor(conDatosUsuario(D, { frac: { tipo: "frac", datos: lr.serie.datos, archivo: "c.csv", cargada: "2026-11-18T12:00:00Z", fechaCurva: "2026-11-17" } }));
    const defs = def as unknown as Record<string, EntradasUI>;
    const r = resolverPlantilla(
      "ibrSpread",
      { motor: m },
      defs,
      { fecha: "2026-11-18", vencimiento: "2028-05-18", frecuencia: "Trimestral", base: "30/360", objetivo: 13, convencionClase: true },
      { frac: "FRAC: cargada por el usuario · 17·nov·2026", exp: "", fracUsuario: true },
    );
    expect(r.respuesta.ok && r.respuesta.x).toBeCloseTo(1.27, 2);
    const t = r.sensibilidad!;
    expect(t.columnas).toEqual(["FRA + XIRR (clase)", "FRA + base", "Publicado + XIRR", "Publicado + base (motor)"]);
    const fila = (b: string) => t.filas.find((f) => f.etiqueta === `Base ${b}`)!.valores;
    expect(fila("30/360")[0]).toBeCloseTo(1.27, 2);
    expect(fila("Real/360")[0]).toBeCloseTo(1.11, 2);
    expect(fila("Real/365")[0]).toBeCloseTo(1.28, 2);
    expect(fila("30/360")[3]).toBeCloseTo(1.213, 2);
  });
});
