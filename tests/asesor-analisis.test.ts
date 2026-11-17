/* El asesor tiene una herramienta para cada función de la calculadora y sus cifras son las mismas
   que muestra la página (mismo código: lib/analisis, lib/pyg, motor). */
import { describe, expect, it } from "vitest";
import { armarContexto, SISTEMA_AGENTE } from "@/lib/asesor/agente";
import { ejecutarHerramienta, HERRAMIENTAS } from "@/lib/asesor/herramientas";
import { validarPeticion } from "@/lib/asesor/peticion";
import { curvaPara, retornoEsperado, sumarRetornos, HORIZONTES_DIAS } from "@/lib/analisis/retorno-esperado";
import { inflacionImplicita } from "@/lib/analisis/inflacion-implicita";
import { crearDefaults, crearPfEjemplo } from "@/lib/calculadora";
import { esError, holding } from "@/lib/engine";
import { F } from "@/lib/format";
import { PARAMETROS_OFICIALES } from "@/lib/impuestos/parametros";
import { PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import { compararOpciones } from "@/lib/pyg/comparador";
import { SNAP_PRUEBA } from "./snap-prueba";

const def = crearDefaults("2026-11-04");
const pf = crearPfEjemplo(def).map((p) => p.inputs);
const UVR = { fecha: "2026-11-04", fuente: "Prueba", refs: [{ titulo: "TES UVR 2029", vencimiento: "2029-04-18", tirReal: 0.054 }, { titulo: "TES UVR 2035", vencimiento: "2035-04-25", tirReal: 0.057 }] };
const contexto = (uvr: typeof UVR | null = null) =>
  armarContexto(SNAP_PRUEBA, { titulo: def.TF, portafolio: { fecha: "2026-11-04", posiciones: pf }, fondeo: null, uvr }).ctx;
const correr = (nombre: string, entrada: unknown = {}, ctx = contexto()) => {
  const r = ejecutarHerramienta(nombre, entrada, ctx);
  return { ...r, j: JSON.parse(r.contenido) };
};

describe("Cobertura de funciones", () => {
  it("hay herramienta para cada sección de la calculadora", () => {
    const nombres = HERRAMIENTAS.map((h) => h.name);
    for (const n of [
      "valorar_titulo",
      "simular_escenario_tasas",
      "comparar_opciones",
      "analizar_fondeo",
      "resumen_portafolio",
      "datos_mercado",
      "calcular_impuestos",
      "calcular_pyg",
      "curva_tes",
      "inflacion_implicita",
      "retorno_esperado",
      "analisis_titulo",
      "simular_venta",
      "flujos",
      "comparador_cdt_tes",
    ])
      expect(nombres).toContain(n);
    for (const n of ["curva_tes", "inflacion_implicita", "retorno_esperado", "analisis_titulo", "simular_venta", "flujos", "comparador_cdt_tes"]) expect(SISTEMA_AGENTE).toContain(n);
  });
});

describe("Herramientas nuevas: mismas cifras que la página", () => {
  it("curva_tes: spots del motor y referencias", () => {
    const ctx = contexto();
    const { j, error } = correr("curva_tes", {}, ctx);
    expect(error).toBe(false);
    expect(j.spot_cero_cupon.find((x: { plazo_anios: number }) => x.plazo_anios === 10).tasa).toBe(F.pct(ctx.motor.spot(10), 3));
    expect(j.referencias.length).toBe(SNAP_PRUEBA.datos.tes.length);
  });

  it("inflacion_implicita: sin TIR UVR lo dice; con las del usuario usa lib/analisis", () => {
    expect(correr("inflacion_implicita").error).toBe(true);
    const ctx = contexto(UVR);
    const { j } = correr("inflacion_implicita", {}, ctx);
    const ref = inflacionImplicita(SNAP_PRUEBA.datos.tes.map((r) => [r[4], r[3]] as [number, number]), UVR);
    expect(j.referencias.map((r: { inflacion_implicita: string }) => r.inflacion_implicita)).toEqual(ref.map((r) => F.pct(r.implicita, 2)));
    expect(j.datos_uvr).toMatch(/usuario/);
  });

  it("retorno_esperado: igual a lib/analisis/retorno-esperado (título y portafolio)", () => {
    const ctx = contexto();
    const t = ctx.titulo!;
    const curva = { fecha: SNAP_PRUEBA.datos.curveDate, refs: SNAP_PRUEBA.datos.tes.map((r) => [r[4], r[3]] as [number, number]) };
    const r = retornoEsperado(ctx.motor, t.b, t.o, 365, curvaPara(t.b.tipo, curva, null));
    if ("error" in r) throw new Error(r.error);
    const { j } = correr("retorno_esperado", { sobre: "titulo_calculadora" }, ctx);
    expect(j.horizontes[3].total).toBe(F.mill(r.total, 1));
    expect(j.horizontes[3].roll_down).toBe(F.mill(r.roll!, 1));
    const pfR = correr("retorno_esperado", { sobre: "portafolio" }, ctx).j;
    const filas = ctx.portafolio.map((x) => HORIZONTES_DIAS.map((d) => retornoEsperado(ctx.motor, x.b, x.o, d, curvaPara(x.b.tipo, curva, null))));
    expect(pfR.horizontes[3].total).toBe(F.mill(sumarRetornos(filas)[3].total, 1));
    expect(pfR.por_posicion_365_dias).toHaveLength(4);
  });

  it("analisis_titulo: liquidez, spread y valorización; atribución con la compra original", () => {
    const { j } = correr("analisis_titulo");
    expect(j.liquidez.nivel).toMatch(/Alta|Media|Baja/);
    expect(j.spread_actual.valor).toMatch(/pb$/);
    expect(j.potencial_valorizacion.ganancia).toMatch(/M$/);
    const a = correr("analisis_titulo", { fecha_compra: "2026-10-20", tasa_compra_original_pct: 14 }).j;
    expect(a.resultado_desde_la_compra.total).toMatch(/M$/);
  });

  it("simular_venta: igual a «Simular venta» (holding del motor)", () => {
    const ctx = contexto();
    const t = ctx.titulo!;
    const h = holding(t.b, t.o, "2027-11-04", 0.12);
    if (esError(h)) throw new Error(h.error);
    const { j } = correr("simular_venta", { fecha_venta: "2027-11-04", tasa_venta_pct: 12 }, ctx);
    expect(j.tir_de_la_inversion_ea).toBe(F.pct(h.tir, 3));
    expect(j.ganancia).toBe(F.cop(h.gan));
    expect(correr("simular_venta", { fecha_venta: "2020-01-01" }).error).toBe(true);
  });

  it("flujos: pagos del título y escalera del portafolio", () => {
    const t = correr("flujos", { sobre: "titulo_calculadora" }).j;
    expect(t.pagos_pendientes).toBeGreaterThan(0);
    expect(t.pagos[0].flujo_pesos).toMatch(/^\$/);
    const p = correr("flujos", { sobre: "portafolio" }).j;
    expect(p.escalera_por_anio.length).toBeGreaterThan(1);
  });

  it("comparador_cdt_tes: igual al comparador de la página, con escenarios", () => {
    const ctx = contexto();
    const { j } = correr("comparador_cdt_tes", { plazo_anios: 3, monto: 1e9, tasa_cdt_pct: 10 }, ctx);
    const ref = compararOpciones(SNAP_PRUEBA.datos, { monto: 1e9, plazoAnios: 3, fecha: ctx.fecha, tasaCDT: 0.1 }, PERFIL_INICIAL, PARAMETROS_OFICIALES);
    expect(j.opciones[0].real).toContain(F.mill(ref[0].pyg!.real, 1));
    expect(j.escenarios).toHaveLength(5);
    expect(j.aviso).toMatch(/contador/);
  });

  it("valorar_titulo trae sensibilidad y datos_mercado trae expectativas y devaluación", () => {
    const v = correr("valorar_titulo", { usar_titulo_calculadora: true }).j;
    expect(v.sensibilidad).toHaveLength(4);
    const m = correr("datos_mercado").j;
    expect(m.expectativas_inflacion.trayectoria.length).toBeGreaterThan(1);
    expect(m.trm.devaluacion_12_meses).toMatch(/%$/);
  });
});

describe("Petición: TIR UVR del usuario", () => {
  it("acepta las cargadas y descarta las de ejemplo o mal formadas", () => {
    const ok = validarPeticion({ pregunta: "x", uvr: UVR });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.p.uvr?.refs).toHaveLength(2);
    const ej = validarPeticion({ pregunta: "x", uvr: { ...UVR, ejemplo: true } });
    if (!ej.ok) throw new Error(ej.error);
    expect(ej.p.uvr).toBeNull();
    const mal = validarPeticion({ pregunta: "x", uvr: { fecha: "ayer", refs: [] } });
    if (!mal.ok) throw new Error(mal.error);
    expect(mal.p.uvr).toBeNull();
  });
});
