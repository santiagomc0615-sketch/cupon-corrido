/* Reporte PDF: las cifras salen del motor y de lib/carry sin recalcular; el PDF es de una página carta.
   Con REPORTE_SALIDA=<carpeta> también guarda los PDF de ejemplo (TES TF 2031 y portafolio). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { DocInforme } from "@/components/reporte/DocInforme";
import { DocPortafolio } from "@/components/reporte/DocPortafolio";
import { DocTitulo } from "@/components/reporte/DocTitulo";
import { registrarFuentes } from "@/components/reporte/piezas";
import datos from "@/data/datos-mercado.json";
import { seccionesInforme } from "@/lib/asesor/informe";
import { CONFIG_INICIAL, carryConConfig } from "@/lib/carry/config";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { crearDefaults, crearPfEjemplo, toEngine } from "@/lib/calculadora";
import { resumenTitulo } from "@/lib/cliente";
import { combinar } from "@/lib/data/combinar";
import { MACRO } from "@/lib/data/macro";
import { crearMotor, esError, pfMetrics, type DatosMercado } from "@/lib/engine";
import { armarReportePortafolio, armarReporteTitulo, flujosReporte, fuentesReporte } from "@/lib/reporte/datos";

const D = datos as unknown as DatosMercado;
const motor = crearMotor(D);
const FECHA = "2026-11-17";
const def = crearDefaults(FECHA);
const { fuentes } = combinar(D, { errores: {} }, { indice: { frac: [], series: {} }, series: {} });
const mercado = { sofr: 0.039, spot: 3316.7, tpm: MACRO.tpm, ibr: null };

const valorar = (t: keyof typeof def) => {
  const b = toEngine(def[t]);
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return { b, o, titulo: String(def[t].nombre) };
};

registrarFuentes(path.join(process.cwd(), "public"));

/** Número de páginas del PDF (objeto /Type /Pages … /Count N). */
const paginas = (buf: Buffer) => Number(buf.toString("latin1").match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)?.[1] ?? 0);

describe("Reporte de un título", () => {
  const { b, o } = valorar("TF");
  const r = armarReporteTitulo({ b, o, titulo: "TES TF 2031", cliente: "Cliente de ejemplo", fondeo: CONFIG_INICIAL, mercado, tasaCDT: 0.1079, fuentes });

  it("toma las cifras del motor y de lib/carry tal cual", () => {
    expect(r.tir).toBe(o.irr);
    expect(r.sucio).toBe(o.dirty);
    expect(r.limpio).toBe(o.clean);
    expect(r.giro).toBe(o.giro);
    expect(r.duracionMod).toBe(o.mod);
    expect(r.dv01).toBe(o.dv01);
    const cli = resumenTitulo(b, o);
    expect(r.cliente_.gananciaAnual).toBe(cli.gananciaAnual);
    expect(r.cliente_.colchonPb).toBe(cli.colchonPb);
    expect(r.cdt).toEqual(cli.comparar(0.1079));
    expect(r.carry?.carryDia).toBe(carryConConfig(posicionDesdeMotor(b, o), CONFIG_INICIAL, mercado)?.carryDia);
  });

  it("flujos: cupón y capital suman lo que paga el motor", () => {
    const f = flujosReporte(b, o);
    const total = f.reduce((s, x) => s + x.cupon + x.capital, 0);
    expect(total).toBeCloseTo(o.cashCOP.reduce((s, c) => s + c.cop, 0), 2);
    expect(f[f.length - 1].capital).toBeCloseTo(b.nominal, 2); // el capital se paga al vencimiento
    expect(f.slice(0, -1).every((x) => x.capital === 0)).toBe(true);
  });

  it("sin fondeo configurado (capital propio) no hay bloque de carry", () => {
    expect(armarReporteTitulo({ b, o, titulo: "x", fondeo: { ...CONFIG_INICIAL, tipo: "propio" }, mercado, fuentes }).carry).toBeNull();
  });

  it("genera un PDF de una página carta", async () => {
    const buf = await renderToBuffer(createElement(DocTitulo, { r, generado: "17 nov 2026" }) as unknown as ReactElement<DocumentProps>);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas(buf)).toBe(1);
    expect(buf.toString("latin1")).toMatch(/\/MediaBox \[0 0 612 792\]/);
    if (process.env.REPORTE_SALIDA) writeFileSync(path.join(process.env.REPORTE_SALIDA, "reporte-TES-TF-2031.pdf"), buf);
  }, 60_000);
});

describe("Reporte del portafolio", () => {
  // El portafolio de ejemplo de la página (con nominales realistas)
  const pos = crearPfEjemplo(def).map((p) => {
    const b = toEngine(p.inputs);
    const o = motor.price(b);
    if (esError(o)) throw new Error(o.error);
    return { b, o, titulo: String(p.inputs.nombre) };
  });
  const r = armarReportePortafolio({ posiciones: pos, valoracion: FECHA, cliente: "Cliente de ejemplo", fuentes })!;

  it("valor, duración, DV01 y estrés salen de pfMetrics del motor", () => {
    const m = pfMetrics(pos.map((x) => ({ p: x.titulo, b: x.b, o: x.o })));
    expect(r.valor).toBe(m.mv);
    expect(r.duracionMod).toBe(m.mod);
    expect(r.dv01).toBe(m.dv01);
    expect(r.estres.map((e) => e.cambio)).toEqual(m.stress.map((x) => x[1]));
    expect(r.composicion.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1, 12);
    expect(r.posiciones).toHaveLength(4);
  });

  it("genera un PDF de una página carta", async () => {
    const buf = await renderToBuffer(createElement(DocPortafolio, { r, generado: "17 nov 2026" }) as unknown as ReactElement<DocumentProps>);
    expect(paginas(buf)).toBe(1);
    if (process.env.REPORTE_SALIDA) writeFileSync(path.join(process.env.REPORTE_SALIDA, "reporte-portafolio.pdf"), buf);
  }, 60_000);
});

describe("Informe para el cliente (asesor de IA)", () => {
  const texto = `### Resumen
Su portafolio vale **$ 11.167,3 M** y rinde _11,9 %_.
### Qué pasaría si cambian las tasas
- Si suben **100 pb**: −$ 313,5 M (−2,81 %).
- Si el BanRep recorta 50 pb: $ 90,9 M.
### Riesgos a tener en cuenta
- Riesgo de tasa en el TES 2031.

Herramienta académica, no es asesoría financiera. Respuestas generadas por IA.`;

  it("convierte el markdown en secciones con negritas, sin marcas", () => {
    const sec = seccionesInforme(texto);
    expect(sec.map((x) => x.titulo)).toEqual(["Resumen", "Qué pasaría si cambian las tasas", "Riesgos a tener en cuenta"]);
    expect(sec[0].bloques[0].partes).toEqual([
      { t: "Su portafolio vale ", negrita: false },
      { t: "$ 11.167,3 M", negrita: true },
      { t: " y rinde 11,9 %.", negrita: false },
    ]);
    expect(sec[1].bloques.map((b) => b.tipo)).toEqual(["li", "li"]);
    expect(sec[2].bloques).toHaveLength(2);
  });

  it("genera un PDF carta con las secciones", async () => {
    const r = { secciones: seccionesInforme(texto), perfil: "Moderado", valoracion: FECHA, cliente: "Cliente de prueba", fuentes: fuentesReporte(fuentes, ["tpm", "ibr", "tes"]) };
    const buf = await renderToBuffer(createElement(DocInforme, { r, generado: "17 nov 2026" }) as unknown as ReactElement<DocumentProps>);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas(buf)).toBe(1);
    if (process.env.REPORTE_SALIDA) writeFileSync(path.join(process.env.REPORTE_SALIDA, "informe-cliente.pdf"), buf);
  });
});

describe("Página P&G en el reporte", () => {
  it("agrega una segunda página con el estado de resultados", async () => {
    const { estadoPyG } = await import("@/lib/pyg/estado");
    const { entradasDesdeMotor } = await import("@/lib/pyg/desde-motor");
    const { PARAMETROS_OFICIALES } = await import("@/lib/impuestos/parametros");
    const { PERFIL_INICIAL } = await import("@/lib/impuestos/perfil");
    const v = valorar("TF");
    const e = entradasDesdeMotor(motor, v.b, v.o, { alVencimiento: true }, { ipc: D.ipc, exp: D.exp });
    if ("error" in e) throw new Error(e.error);
    const r = armarReporteTitulo({ ...v, cliente: "Cliente de prueba", fuentes });
    const pyg = { resultado: estadoPyG(e, PERFIL_INICIAL, PARAMETROS_OFICIALES), supuesto: "Se mantiene hasta el vencimiento", perfil: "Persona natural no obligada" };
    const buf = await renderToBuffer(createElement(DocTitulo, { r, generado: "17 nov 2026", pyg }) as unknown as ReactElement<DocumentProps>);
    expect(paginas(buf)).toBe(2);
    if (process.env.REPORTE_SALIDA) writeFileSync(path.join(process.env.REPORTE_SALIDA, "reporte-TES-TF-2031-pyg.pdf"), buf);
  });
});
