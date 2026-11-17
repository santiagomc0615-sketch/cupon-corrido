/* P&G con impuestos e inflación (lib/pyg, lib/impuestos). Casos de persona natural y jurídica
   calculados a mano, más la conexión con el motor y el comparador. */
import { describe, expect, it } from "vitest";
import datos from "@/data/datos-mercado.json";
import { crearDefaults, toEngine } from "@/lib/calculadora";
import { crearMotor, esError, holding, type DatosMercado } from "@/lib/engine";
import { PARAMETROS_OFICIALES as P, FUENTES, conOficiales } from "@/lib/impuestos/parametros";
import { impuesto241, impuestoRentaOrdinaria, tarifaMarginal, PERFIL_INICIAL, type PerfilContribuyente } from "@/lib/impuestos/perfil";
import { compararOpciones, escenariosComparador, moverDatos } from "@/lib/pyg/comparador";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { anualizar, estadoPyG, type EntradasPyG } from "@/lib/pyg/estado";
import { inflacionEntre } from "@/lib/pyg/inflacion";

const D = datos as unknown as DatosMercado;
const linea = (r: ReturnType<typeof estadoPyG>, k: string) => r.lineas.find((l) => l.clave === k)?.valor;

/* Caso base (pesos): compra limpio 98.000.000 + corrido 2.000.000 = capital 100.000.000; un año
   (365 días) con 10.000.000 de cupones; venta limpio 99.000.000 + corrido 1.000.000; comisiones
   100.000; sin fondeo; inflación del periodo 5 %. */
const BASE: EntradasPyG = {
  fechaCompra: "2025-03-01",
  fechaVenta: "2026-03-01",
  capital: 100_000_000,
  limpioCompra: 98_000_000,
  corridoCompra: 2_000_000,
  limpioVenta: 99_000_000,
  corridoVenta: 1_000_000,
  cupones: [{ fecha: "2025-09-01", interes: 10_000_000, amort: 0 }],
  costoFondeo: 0,
  comisiones: 100_000,
  inflacion: 0.05,
  inflacionProyectada: false,
  indexado: false,
};

describe("Parámetros tributarios", () => {
  it("valores oficiales verificados, cada uno con norma, fecha y enlace", () => {
    expect(P).toMatchObject({ retencion: 0.04, componenteInflacionario: 0.5543, uvt: 52374, gananciaOcasional: 0.15, rentaJuridica: 0.35, gmf: 0.004 });
    for (const k of ["retencion", "componenteInflacionario", "uvt", "tabla241", "gananciaOcasional", "rentaJuridica", "gmf"] as const) {
      expect(FUENTES[k]?.enlace).toMatch(/^https:\/\//);
      expect(FUENTES[k]?.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(conOficiales({ gmf: 0 }).gmf).toBe(0);
    expect(conOficiales(null).tabla241).toHaveLength(7);
  });

  it("tabla del art. 241: tramos y continuidad", () => {
    expect(impuesto241(1000, P.tabla241)).toBe(0);
    expect(impuesto241(1700, P.tabla241)).toBeCloseTo(115.9, 6); // 610 × 19 %
    expect(impuesto241(4100, P.tabla241)).toBeCloseTo(788, 6); // 116 + 2.400 × 28 %
    expect(impuesto241(40000, P.tabla241)).toBeCloseTo(13862, 6); // 10.352 + 9.000 × 39 %
    expect(tarifaMarginal(100_000_000, P)).toBe(0.28); // 1.909 UVT
  });
});

describe("P&G · persona natural no obligada (a mano)", () => {
  const perfil: PerfilContribuyente = { ...PERFIL_INICIAL, tarifaManual: 0.19 };
  const r = estadoPyG(BASE, perfil, P);

  it("estado de resultados", () => {
    // intereses 10.000.000; utilidad en venta 99 − 98 = 1.000.000; corrido 1 − 2 = −1.000.000
    expect(linea(r, "cupones")).toBe(10_000_000);
    expect(linea(r, "venta")).toBe(1_000_000);
    expect(linea(r, "corrido")).toBe(-1_000_000);
    // UAI = 10.000.000 + 1.000.000 − 1.000.000 − 100.000 = 9.900.000
    expect(r.utilidadAntes).toBe(9_900_000);
    // rendimientos financieros (< 2 años, todo renta ordinaria) = 10.000.000; no gravado 55,43 % = 5.543.000
    expect(linea(r, "noGravado")).toBeCloseTo(-5_543_000, 6);
    // base = 10.000.000 − 5.543.000 − 100.000 = 4.357.000; impuesto 19 % = 827.830
    expect(r.rentaOrdinaria).toBeCloseTo(4_357_000, 6);
    expect(r.impuesto).toBeCloseTo(827_830, 6);
    // retención informativa 4 % × 10.000.000 = 400.000 (no resta)
    expect(linea(r, "retencion")).toBeCloseTo(400_000, 6);
    // neta = 9.900.000 − 827.830 = 9.072.170; inflación 5 % × 100.000.000 = 5.000.000; real 4.072.170
    expect(r.neta).toBeCloseTo(9_072_170, 6);
    expect(r.real).toBeCloseTo(4_072_170, 6);
    // un año exacto: rentabilidades = ganancia / capital
    expect(r.rentNominal).toBeCloseTo(0.099, 12);
    expect(r.rentDespues).toBeCloseTo(0.0907217, 12);
    expect(r.rentReal).toBeCloseTo(0.0407217, 12);
    expect(r.frase).toBe("Después de impuestos e inflación, tu dinero creció 4,07 % real al año.");
  });

  it("con ingresos anuales usa la tabla del art. 241 (impuesto incremental)", () => {
    // ingresos 100.000.000 = 1.909,34 UVT y + base = 1.992,53 UVT: ambos en el tramo del 28 %
    const r2 = estadoPyG(BASE, { ...perfil, ingresosAnuales: 100_000_000 }, P);
    expect(r2.impuesto).toBeCloseTo(4_357_000 * 0.28, 4); // 1.219.960
  });

  it("obligada a llevar contabilidad: sin componente inflacionario", () => {
    const r3 = estadoPyG(BASE, { ...perfil, tipo: "pn_obligada" }, P);
    expect(linea(r3, "noGravado")).toBeUndefined();
    expect(r3.impuesto).toBeCloseTo(9_900_000 * 0.19, 6); // base 10.000.000 − 100.000
  });

  it("GMF opcional: 4 × 1.000 de lo retirado (venta + cupones)", () => {
    const r4 = estadoPyG(BASE, { ...perfil, gmf: true }, P);
    expect(linea(r4, "gmf")).toBeCloseTo(-0.004 * (99_000_000 + 1_000_000 + 10_000_000), 6); // −440.000
    expect(r4.neta).toBeCloseTo(9_072_170 - 440_000, 6);
  });
});

describe("P&G · persona jurídica (a mano)", () => {
  const r = estadoPyG(BASE, { ...PERFIL_INICIAL, tipo: "juridica" }, P);
  it("35 % sobre la utilidad, sin componente inflacionario", () => {
    // base = 10.000.000 − 100.000 = 9.900.000; impuesto 35 % = 3.465.000
    expect(linea(r, "noGravado")).toBeUndefined();
    expect(r.rentaOrdinaria).toBe(9_900_000);
    expect(r.impuesto).toBeCloseTo(3_465_000, 6);
    // neta 6.435.000; real 6.435.000 − 5.000.000 = 1.435.000
    expect(r.neta).toBeCloseTo(6_435_000, 6);
    expect(r.real).toBeCloseTo(1_435_000, 6);
  });

  it("dos años o más: por defecto la utilidad en venta es renta ordinaria (la DIAN no confirma ganancia ocasional en renta fija)", () => {
    const largo = estadoPyG({ ...BASE, fechaCompra: "2024-02-01", fechaVenta: "2026-02-01" }, { ...PERFIL_INICIAL, tipo: "juridica" }, P);
    expect(largo.largoPlazo).toBe(true);
    expect(largo.gananciaOcasional).toBe(0);
    // ordinaria: 10.000.000 + 1.000.000 − 1.000.000 (corrido) − 100.000 = 9.900.000 × 35 %
    expect(largo.impuesto).toBeCloseTo(9_900_000 * 0.35, 6);
  });

  it("dos años o más y marcado como activo fijo: la utilidad en precio es ganancia ocasional al 15 %", () => {
    const largo = estadoPyG({ ...BASE, fechaCompra: "2024-02-01", fechaVenta: "2026-02-01" }, { ...PERFIL_INICIAL, tipo: "juridica", gananciaOcasionalTitulos: true }, P);
    expect(largo.largoPlazo).toBe(true);
    expect(largo.gananciaOcasional).toBe(1_000_000);
    // ordinaria: 10.000.000 − 1.000.000 (corrido) − 100.000 = 8.900.000 × 35 % + GO 1.000.000 × 15 %
    expect(largo.impuesto).toBeCloseTo(8_900_000 * 0.35 + 150_000, 6);
  });
});

describe("Funciones auxiliares", () => {
  it("impuesto ordinario sin base y anualización", () => {
    expect(impuestoRentaOrdinaria(0, PERFIL_INICIAL, P).impuesto).toBe(0);
    expect(anualizar(10, 100, 365)).toBeCloseTo(0.1, 12);
    expect(anualizar(21, 100, 730)).toBeCloseTo(0.1, 12);
    expect(anualizar(-100, 100, 365)).toBeNull(); // pierde todo el capital: «No aplica»
    expect(anualizar(-150, 100, 365)).toBeNull();
  });

  it("inflación entre fechas con el IPC del DANE y proyectada después del último dato", () => {
    const ult = D.ipc[D.ipc.length - 1];
    const ant = D.ipc[D.ipc.length - 13];
    const anual = inflacionEntre(D.ipc, D.exp, ant[0], ult[0]);
    expect(anual.acumulada).toBeCloseTo(ult[1] / ant[1] - 1, 12);
    expect(anual.proyectada).toBe(false);
    const fut = inflacionEntre(D.ipc, D.exp, ult[0], "2027-09-30");
    expect(fut.proyectada).toBe(true);
    expect(fut.acumulada).toBeGreaterThan(0.03);
    expect(fut.acumulada).toBeLessThan(0.08);
  });
});

describe("Con el motor", () => {
  const motor = crearMotor(D);
  const def = crearDefaults("2026-11-04");
  const b = toEngine(def.TF);
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);

  it("venta anticipada: el total coincide con la ganancia de la simulación de venta del motor", () => {
    const e = entradasDesdeMotor(motor, b, o, { fechaVenta: "2027-11-04", tasaVenta: 0.13 }, { ipc: D.ipc, exp: D.exp });
    if ("error" in e) throw new Error(e.error);
    const h = holding(b, o, "2027-11-04", 0.13);
    if ("error" in h) throw new Error(h.error);
    const r = estadoPyG(e, PERFIL_INICIAL, P);
    // UAI sin costos = (precio sucio de venta + cupones − precio sucio de compra) × nominal; el motor trunca a 3 decimales
    expect(r.utilidadAntes).toBeCloseTo(h.gan, -4);
    expect(e.cupones).toHaveLength(4); // trimestral
  });

  it("al vencimiento, la utilidad en venta es 100 − precio limpio de compra", () => {
    const e = entradasDesdeMotor(motor, b, o, { alVencimiento: true }, { ipc: D.ipc, exp: D.exp });
    if ("error" in e) throw new Error(e.error);
    const r = estadoPyG(e, PERFIL_INICIAL, P);
    expect(linea(r, "venta")).toBeCloseTo(((100 - o.clean) / 100) * b.nominal, 4);
    expect(r.largoPlazo).toBe(true);
  });

  it("comparador: cinco opciones y escenarios con ganador", () => {
    const e = { monto: 1e9, plazoAnios: 3, fecha: "2026-11-04", tasaCDT: 0.1 };
    const filas = compararOpciones(D, e, PERFIL_INICIAL, P);
    expect(filas.map((f) => f.opcion)).toEqual(["CDT", "TF", "IBR", "IPC", "UVR"]);
    expect(filas.every((f) => f.pyg && !f.error)).toBe(true);
    // CDT: intereses = monto × ((1,10)^(días/365) − 1)
    const cdt = filas[0].pyg!;
    expect(cdt.lineas.find((l) => l.clave === "cupones")!.valor).toBeCloseTo(1e9 * (Math.pow(1.1, cdt.dias / 365) - 1), 2);
    const esc = escenariosComparador(D, e, PERFIL_INICIAL, P);
    expect(esc).toHaveLength(5);
    expect(esc.every((x) => x.ganador)).toBe(true);
    // con más inflación esperada, el TES UVR (capital indexado) resiste mejor que el CDT en términos reales.
    // Los flujos IPC/UVR se ajustan en lib/pyg porque el motor proyecta con el último dato publicado.
    const alta = esc.find((x) => x.escenario.id === "inflAlta")!;
    const est = esc.find((x) => x.escenario.id === "estables")!;
    expect(alta.reales.CDT!).toBeLessThan(est.reales.CDT!);
    expect(alta.reales.UVR! - est.reales.UVR!).toBeGreaterThan(alta.reales.CDT! - est.reales.CDT!);
    // con tasas al alza solo cambia el IBR (los demás tienen cupón fijo o indexado a la inflación)
    const suben = esc.find((x) => x.escenario.id === "suben")!;
    expect(suben.reales.IBR!).toBeGreaterThan(est.reales.IBR!);
    expect(suben.reales.TF!).toBeCloseTo(est.reales.TF!, 0);
  });

  it("moverDatos no altera los datos sin movimiento", () => {
    expect(moverDatos(D, 0, 0)).toBe(D);
    expect(moverDatos(D, 100, 0).frac[0][1]).toBeCloseTo(D.frac[0][1] + 0.01, 12);
  });
});

describe("Escenario de inflación en títulos indexados", () => {
  it("UVR: cada flujo × (1 + Δ)^t; IPC: cupones futuros suben Δ × (1 + spread)", () => {
    const motor = crearMotor(D);
    const def = crearDefaults("2026-11-04");
    for (const t of ["UVR", "IPC"] as const) {
      const b = toEngine(def[t]);
      const o = motor.price(b);
      if (esError(o)) throw new Error(o.error);
      const base = entradasDesdeMotor(motor, b, o, { alVencimiento: true }, { ipc: D.ipc, exp: D.exp });
      const alta = entradasDesdeMotor(motor, b, o, { alVencimiento: true, deltaInflacion: 0.02 }, { ipc: D.ipc, exp: D.exp });
      if ("error" in base || "error" in alta) throw new Error("sin entradas");
      const suma = (x: typeof base) => x.cupones.reduce((s, c) => s + c.interes + c.amort, 0);
      expect(suma(alta)).toBeGreaterThan(suma(base));
      if (t === "UVR") {
        const u = base.cupones[base.cupones.length - 1];
        const ua = alta.cupones[alta.cupones.length - 1];
        const anios = (Date.parse(u.fecha) - Date.parse(b.valoracion)) / 864e5 / 365;
        // el capital al vencimiento va en el precio de venta (100), indexado a la UVR del escenario
        expect(alta.limpioVenta / base.limpioVenta).toBeCloseTo(Math.pow(1.02, anios), 10);
        expect(ua.interes / u.interes).toBeCloseTo(Math.pow(1.02, anios), 10);
      }
    }
  });
});

describe("P&G del portafolio y venta con precio dado", () => {
  const motor = crearMotor(D);
  const def = crearDefaults("2026-11-04");
  const pos = (["TF", "IBR", "IPC", "UVR"] as const).map((t) => {
    const b = toEngine(def[t]);
    const o = motor.price(b);
    if (esError(o)) throw new Error(o.error);
    return { b, o };
  });

  it("el total es la suma de las posiciones; las que vencen antes se toman al vencimiento", async () => {
    const { entradasPortafolio } = await import("@/lib/pyg/portafolio");
    const e = entradasPortafolio(motor, pos, "2027-11-04", { ipc: D.ipc, exp: D.exp });
    if ("error" in e) throw new Error(e.error);
    expect(e.capital).toBeCloseTo(pos.reduce((s, x) => s + x.o.giro, 0), 4);
    expect(e.indexado).toBe(true);
  });

  it("con el precio sucio de «Simular venta», la utilidad cuadra con la ganancia del motor", () => {
    const { b, o } = pos[0];
    const h = holding(b, o, "2027-11-04", 0.13);
    if ("error" in h) throw new Error(h.error);
    const e = entradasDesdeMotor(motor, b, o, { fechaVenta: "2027-11-04", sucioVenta: h.pVenta }, { ipc: D.ipc, exp: D.exp });
    if ("error" in e) throw new Error(e.error);
    expect(estadoPyG(e, PERFIL_INICIAL, P).utilidadAntes).toBeCloseTo(h.gan, 2);
  });
});
