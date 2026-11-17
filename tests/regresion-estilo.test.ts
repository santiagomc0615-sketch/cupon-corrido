/* Garantía del rediseño (rama estilo-v3): congela los resultados actuales de los cálculos que muestra
   la interfaz. Si un cambio de diseño alterara una cifra, esta prueba falla.
   Cubre: los 4 ejemplos de la calculadora, el portafolio de ejemplo, carry y fondeo, simular venta y
   el P&G (al vencimiento y vendiendo antes). Fecha y datos fijos (respaldo del Excel). */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { tasaDe } from "@/lib/analisis/comunes";
import { CONFIG_INICIAL, carryConConfig, carryPortafolioFondeo, comparacion, type MercadoFondeo } from "@/lib/carry/config";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { crearDefaults, crearPfEjemplo, toEngine } from "@/lib/calculadora";
import { resumenPortafolio, resumenTitulo } from "@/lib/cliente";
import { crearMotor, esError, holding, pfMetrics, type DatosMercado, type ResultadoValoracion } from "@/lib/engine";
import { PARAMETROS_OFICIALES } from "@/lib/impuestos/parametros";
import { PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import { compararOpciones } from "@/lib/pyg/comparador";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { estadoPyG } from "@/lib/pyg/estado";
import { entradasPortafolio } from "@/lib/pyg/portafolio";

const D = datos as unknown as DatosMercado;
const FECHA = "2026-11-04";
const motor = crearMotor(D);
const def = crearDefaults(FECHA);
const MERCADO: MercadoFondeo = {
  sofr: 0.039,
  sofrFecha: "2026-11-03",
  spot: 3900,
  spotFecha: "2026-11-04",
  spot12m: { valor: 4200, fecha: "2025-11-04" },
  tpm: 0.1225,
  tpmFecha: "2026-10-30",
  ibr: { fecha: "2026-11-03", on: 0.114, m1: 0.1145, m3: 0.1164, m6: 0.118 },
};
const INF = { ipc: D.ipc, exp: D.exp };

/** Campos que la interfaz muestra de una valoración (sin el cronograma completo, que va aparte). */
const ficha = (o: ResultadoValoracion) => ({
  dirty: o.dirty,
  clean: o.clean,
  accrued: o.accrued,
  irr: o.irr,
  yieldCOP: o.yieldCOP,
  giro: o.giro,
  mod: o.mod,
  mac: o.mac,
  dv01: o.dv01,
  conv: o.conv,
  fx: o.fx,
  flujos: o.rows.map((r) => [r.pay, r.K, r.amort, r.L, r.vp]),
});

const TIPOS = ["TF", "IBR", "IPC", "UVR"] as const;

describe("Regresión del rediseño: los cálculos no cambian", () => {
  for (const t of TIPOS) {
    const b = toEngine(def[t]);
    const o = motor.price(b);
    if (esError(o)) throw new Error(o.error);

    it(`calculadora · ejemplo ${t}`, () => {
      expect(ficha(o)).toMatchSnapshot();
      expect(resumenTitulo(b, o)).toMatchSnapshot();
    });

    it(`carry y fondeo · ${t}`, () => {
      const pos = posicionDesdeMotor(b, o);
      expect(carryConConfig(pos, CONFIG_INICIAL, MERCADO)).toMatchSnapshot();
      expect(carryConConfig(pos, { ...CONFIG_INICIAL, tipo: "exterior" }, MERCADO)).toMatchSnapshot();
    });

    it(`simular venta y P&G · ${t}`, () => {
      const venta = "2027-11-04";
      const tasaVenta = tasaDe(b) - 0.005;
      const h = holding(b, o, venta, t === "IBR" ? o.irr - 0.005 : tasaVenta);
      expect(h).toMatchSnapshot();
      const alVenc = entradasDesdeMotor(motor, b, o, { alVencimiento: true }, INF);
      const antes = entradasDesdeMotor(motor, b, o, { fechaVenta: venta, tasaVenta }, INF);
      if ("error" in alVenc || "error" in antes) throw new Error("sin entradas");
      expect(estadoPyG(alVenc, PERFIL_INICIAL, PARAMETROS_OFICIALES)).toMatchSnapshot();
      expect(estadoPyG(antes, { ...PERFIL_INICIAL, tipo: "juridica" }, PARAMETROS_OFICIALES)).toMatchSnapshot();
    });
  }

  it("portafolio de ejemplo · métricas, vista cliente, fondeo y P&G", () => {
    const V = crearPfEjemplo(def).map((p) => {
      const b = toEngine({ ...p.inputs, valoracion: FECHA });
      const o = motor.price(b);
      if (esError(o)) throw new Error(o.error);
      return { p: String(p.inputs.nombre), b, o };
    });
    const m = pfMetrics(V);
    expect({ mv: m.mv, ytm: m.ytm, mod: m.mod, mac: m.mac, conv: m.conv, dv01: m.dv01, byType: m.byType, stress: m.stress, ladder: m.ladder }).toMatchSnapshot();
    expect(resumenPortafolio(V.map((x) => ({ b: x.b, o: x.o, titulo: x.p })))).toMatchSnapshot();
    expect(carryPortafolioFondeo(V.map((x) => posicionDesdeMotor(x.b, x.o)), CONFIG_INICIAL, MERCADO)).toMatchSnapshot();
    expect(comparacion(CONFIG_INICIAL, MERCADO, 1e10)).toMatchSnapshot();
    const e = entradasPortafolio(motor, V.map((x) => ({ b: x.b, o: x.o })), "2027-11-04", INF);
    if ("error" in e) throw new Error(e.error);
    expect(estadoPyG(e, PERFIL_INICIAL, PARAMETROS_OFICIALES)).toMatchSnapshot();
  });

  it("comparador CDT vs. TES", () => {
    expect(compararOpciones(D, { monto: 1e9, plazoAnios: 3, fecha: FECHA, tasaCDT: 0.1 }, PERFIL_INICIAL, PARAMETROS_OFICIALES)).toMatchSnapshot();
  });
});
