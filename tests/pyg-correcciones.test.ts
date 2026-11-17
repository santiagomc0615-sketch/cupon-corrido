/* Correcciones de la ventana P&G: amortización, fondeo consistente con lib/carry, impuestos y
   presentación. Casos pedidos: persona natural no obligada, 19 % sobre la parte gravable, 55,43 % no
   gravado, inflación 6,30 %, compra 2026-11-04 y venta 2027-11-04 a la misma TIR, sin fondeo. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { tasaDe } from "@/lib/analisis/comunes";
import { calcularCarry } from "@/lib/carry/fondeo";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { crearMotor, esError, toN, type DatosMercado, type TipoBono } from "@/lib/engine";
import { PARAMETROS_OFICIALES as P } from "@/lib/impuestos/parametros";
import { PERFIL_INICIAL, type PerfilContribuyente } from "@/lib/impuestos/perfil";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { estadoPyG, textoRent, type EntradasPyG } from "@/lib/pyg/estado";
import { conFondeo, simularFondeo } from "@/lib/pyg/fondeo";

const D = datos as unknown as DatosMercado;
const motor = crearMotor(D);
const def = crearDefaults("2026-11-04");
const PN19: PerfilContribuyente = { ...PERFIL_INICIAL, tipo: "pn_no_obligada", tarifaManual: 0.19 };
const INF = { ipc: D.ipc, exp: D.exp };

const titulo = (t: TipoBono) => {
  const b = toEngine(def[t]);
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return { b, o };
};
/** Venta a 365 días a la misma tasa, con la inflación del caso (6,30 %). */
const ventaMismaTasa = (t: TipoBono): EntradasPyG => {
  const { b, o } = titulo(t);
  const e = entradasDesdeMotor(motor, b, o, { fechaVenta: "2027-11-04", tasaVenta: tasaDe(b) }, INF);
  if ("error" in e) throw new Error(e.error);
  return { ...e, inflacion: 0.063, inflacionProyectada: false };
};
const linea = (r: ReturnType<typeof estadoPyG>, k: string) => r.lineas.find((l) => l.clave === k);

describe("Casos pedidos (sin fondeo, a la misma TIR, 365 días)", () => {
  // Esperado: bruto, neto y real E.A. en %. Tolerancia: 0,3 puntos.
  const casos: [TipoBono, string, number, number, number][] = [
    ["TF", "2031", 12.9, 11.8, 5.5],
    ["IBR", "2028", 13.0, 11.9, 5.6],
    ["IPC", "2036", 13.5, 12.3, 6.0],
  ];
  for (const [t, anio, bruto, neto, real] of casos) {
    it(`${t} ${anio}: bruto ≈ ${bruto} %, neto ≈ ${neto} %, real ≈ ${real} %`, () => {
      const r = estadoPyG(ventaMismaTasa(t), PN19, P);
      expect(Math.abs(r.rentNominal! * 100 - bruto)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(r.rentDespues! * 100 - neto)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(r.rentReal! * 100 - real)).toBeLessThanOrEqual(0.3);
      // cupones e intereses son renta ordinaria: la base no queda en $0
      expect(linea(r, "baseOrd")!.valor).toBeGreaterThan(0);
      expect(r.impuesto).toBeGreaterThan(0);
    });
  }
});

describe("Amortización: el capital devuelto no es utilidad", () => {
  it("mantenido al vencimiento: utilidad en venta = (100 − precio limpio de compra) × nominal; utilidad positiva", () => {
    const { b, o } = titulo("TF");
    const e = entradasDesdeMotor(motor, b, o, { alVencimiento: true }, INF);
    if ("error" in e) throw new Error(e.error);
    // el precio de venta es 100 y el capital no entra en los cupones
    expect(e.limpioVenta).toBeCloseTo(b.nominal, 4);
    expect(e.cupones.every((c) => c.amort === 0)).toBe(true);
    const r = estadoPyG(e, PN19, P);
    expect(linea(r, "venta")!.valor).toBeCloseTo(((100 - o.clean) / 100) * b.nominal, 4);
    expect(linea(r, "venta")!.nota).toBeUndefined(); // sin «incluye la amortización…»
    expect(Math.abs(linea(r, "venta")!.valor)).toBeLessThan(0.05 * b.nominal); // nunca el capital entero
    expect(r.utilidadAntes).toBeGreaterThan(0);
    expect(r.utilidadAntes).toBeLessThan(b.nominal); // < 1× el capital: no suma el nominal como ganancia
  });
});

describe("Impuestos", () => {
  it("persona obligada a llevar contabilidad: sin componente inflacionario", () => {
    const e = ventaMismaTasa("TF");
    const r = estadoPyG(e, { ...PN19, tipo: "pn_obligada" }, P);
    expect(linea(r, "noGravado")).toBeUndefined();
    // base = cupones + utilidad en venta + corrido neto (todo renta ordinaria) × 19 %
    expect(r.impuesto).toBeCloseTo(r.utilidadAntes * 0.19, 2);
    const noObl = estadoPyG(e, PN19, P);
    expect(linea(noObl, "noGravado")!.valor).toBeCloseTo(-0.5543 * r.utilidadAntes, 2);
  });

  it("ganancia ocasional solo sobre la utilidad en venta positiva, con 2 años o más y si se marca como activo fijo", () => {
    const { b, o } = titulo("TF");
    const e = entradasDesdeMotor(motor, b, o, { fechaVenta: "2029-11-04", tasaVenta: tasaDe(b) - 0.02 }, INF);
    if ("error" in e) throw new Error(e.error);
    const util = linea(estadoPyG(e, PN19, P), "venta")!.valor;
    expect(util).toBeGreaterThan(0);
    expect(estadoPyG(e, PN19, P).gananciaOcasional).toBe(0); // por defecto, renta ordinaria
    const go = estadoPyG(e, { ...PN19, gananciaOcasionalTitulos: true }, P);
    expect(go.gananciaOcasional).toBeCloseTo(util, 4);
    // con pérdida en venta no hay ganancia ocasional aunque se marque
    const perd = entradasDesdeMotor(motor, b, o, { fechaVenta: "2029-11-04", tasaVenta: tasaDe(b) + 0.03 }, INF);
    if ("error" in perd) throw new Error(perd.error);
    expect(estadoPyG(perd, { ...PN19, gananciaOcasionalTitulos: true }, P).gananciaOcasional).toBe(0);
  });

  it("si el resultado total es pérdida, el impuesto es 0 y se muestra como pérdida fiscal", () => {
    const { b, o } = titulo("TF");
    const e = entradasDesdeMotor(motor, b, o, { fechaVenta: "2027-11-04", tasaVenta: tasaDe(b) + 0.06 }, INF);
    if ("error" in e) throw new Error(e.error);
    const r = estadoPyG(e, PN19, P);
    expect(r.utilidadAntes).toBeLessThan(0);
    expect(r.impuesto).toBe(0);
    expect(r.perdidaFiscal).toBe(true);
    expect(linea(r, "perdidaFiscal")).toBeDefined();
  });
});

describe("Fondeo: misma lógica de lib/carry", () => {
  const { b, o } = titulo("TF");
  const tasa = 0.1225,
    haircut = 0.1;
  const fondeado = o.giro * (1 - haircut);

  it("con fondeo, venta a 365 días y misma TIR, la utilidad antes de impuestos coincide con el carry neto de 365 días (≤ 1 %)", () => {
    const e = ventaMismaTasa("TF");
    const conF = conFondeo(e, { fondeado, tasaEA: tasa });
    const r = estadoPyG(conF, PN19, P);
    const carry = calcularCarry(posicionDesdeMotor(b, o), { tipo: "repo", haircut }, tasa, [365]).horizontes[0].carry;
    // Ajuste por cupones: el carry (lib/carry) capitaliza la causación a la TIR; en el P&G cada cupón
    // paga el préstamo a la tasa del fondeo. Diferencia = Σ cupón × [(1+TIR)^r − (1+tasa)^r].
    const fin = toN(e.fechaVenta);
    const ajuste = e.cupones.reduce((s, c) => {
      const r365 = (fin - toN(c.fecha)) / 365;
      return s + (c.interes + c.amort) * (Math.pow(1 + o.irr, r365) - Math.pow(1 + tasa, r365));
    }, 0);
    expect(Math.abs(r.utilidadAntes + ajuste - carry) / Math.abs(carry)).toBeLessThan(0.01);
    // sin ajustar la diferencia es pequeña y la explica la tasa a la que «rinden» los cupones
    expect(Math.abs(r.utilidadAntes - carry) / Math.abs(carry)).toBeLessThan(0.05);
  });

  it("los cupones amortizan el fondeo y los % se miden sobre el capital propio (giro × haircut)", () => {
    const e = ventaMismaTasa("TF");
    const d = simularFondeo(e, { fondeado, tasaEA: tasa });
    expect(d.capitalPropio).toBeCloseTo(o.giro * haircut, 4);
    expect(d.pagadoConCupones).toBeCloseTo(e.cupones.reduce((s, c) => s + c.interes + c.amort, 0), 4);
    // préstamo con abonos: costo < interés sobre el monto completo
    expect(d.costo).toBeLessThan(fondeado * tasa);
    const r = estadoPyG(conFondeo(e, { fondeado, tasaEA: tasa }), PN19, P);
    expect(r.capital).toBeCloseTo(o.giro * haircut, 4);
    expect(linea(r, "inflacion")!.valor).toBeCloseTo(-o.giro * haircut * 0.063, 2);
    // con fondeo y utilidad positiva la base gravable no queda en $0
    expect(r.utilidadAntes).toBeGreaterThan(0);
    expect(linea(r, "baseOrd")!.valor).toBeGreaterThan(0);
  });

  it("si la pérdida supera el capital propio, la rentabilidad E.A. no aplica", () => {
    const e = { ...ventaMismaTasa("TF"), limpioVenta: ventaMismaTasa("TF").limpioVenta * 0.7 }; // caída fuerte del precio
    const r = estadoPyG(conFondeo(e, { fondeado, tasaEA: tasa }), PN19, P);
    expect(r.real).toBeLessThan(-r.capital);
    expect(r.rentReal).toBeNull();
    expect(textoRent(r.rentReal)).toBe("No aplica");
    expect(r.impuesto).toBe(0);
  });
});
