/* Impuestos en el asesor: conocimiento verificado, herramientas calcular_impuestos y calcular_pyg
   (con lib/impuestos y lib/pyg) y validación del perfil tributario. Casos calculados a mano. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { armarContexto, SISTEMA_AGENTE, sistemaVariable } from "@/lib/asesor/agente";
import { ejecutarHerramienta } from "@/lib/asesor/herramientas";
import { validarPeticion } from "@/lib/asesor/peticion";
import { crearDefaults, crearPfEjemplo } from "@/lib/calculadora";
import { PARAMETROS_OFICIALES } from "@/lib/impuestos/parametros";
import { PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { estadoPyG } from "@/lib/pyg/estado";
import { SNAP_PRUEBA } from "./snap-prueba";

const def = crearDefaults("2026-11-04");
const pf = crearPfEjemplo(def).map((p) => p.inputs);
type Tributario = Parameters<typeof armarContexto>[1]["tributario"];
const contexto = (tributario?: Tributario) =>
  armarContexto(SNAP_PRUEBA, { titulo: def.TF, portafolio: { fecha: "2026-11-04", posiciones: pf }, fondeo: null, tributario }).ctx;
const correr = (nombre: string, entrada: unknown, ctx = contexto()) => {
  const r = ejecutarHerramienta(nombre, entrada, ctx);
  return { ...r, j: JSON.parse(r.contenido) };
};

describe("Conocimiento tributario (lib/impuestos/conocimiento.md)", () => {
  const md = readFileSync(path.join(process.cwd(), "lib", "impuestos", "conocimiento.md"), "utf8");

  it("cubre los temas pedidos y cada sección cita una norma con enlace oficial", () => {
    for (const t of [
      "Retención en la fuente",
      "Componente inflacionario",
      "art. 241",
      "Ganancia ocasional",
      "GMF",
      "Persona natural frente a persona jurídica",
      "Fondos de inversión colectiva",
      "pensiones voluntarias",
      "Cuentas AFC",
      "Momento de la venta",
    ])
      expect(md).toContain(t);
    const secciones = md.split(/\n## /).slice(1, 8); // 1 a 7 (la 8 es «lo que no cubre»)
    for (const s of secciones) expect(s).toMatch(/\]\(https:\/\/(normograma\.dian\.gov\.co|www\.cancilleria\.gov\.co)\//);
    expect(md).toMatch(/3\.800 UVT/);
    expect(md).toMatch(/1\.340 UVT/);
    expect(md).toMatch(/10 años/);
    expect(md).toMatch(/no constituye asesoría tributaria/);
  });
});

describe("calcular_impuestos (a mano)", () => {
  it("persona natural no obligada, tarifa 19 %: 10.000.000 de intereses", () => {
    // no gravado 55,43 % = 5.543.000; base 4.457.000; impuesto 19 % = 846.830; retención 4 % = 400.000
    const { j, error } = correr("calcular_impuestos", { rendimientos_financieros: 10_000_000, tarifa_marginal_pct: 19 });
    expect(error).toBe(false);
    expect(j.impuesto_estimado).toBe("$ 846.830");
    expect(j.lineas.find((l: { concepto: string }) => l.concepto.includes("Retención")).valor).toBe("$ 400.000");
    expect(j.neto_despues_de_impuestos).toBe("$ 9.153.170");
    expect(j.normas.join(" ")).toMatch(/Decreto 898 de 2026/);
    expect(j.aviso).toMatch(/confirme con un contador/);
  });

  it("persona jurídica: 35 %; con 3 años de tenencia la utilidad en precio es ganancia ocasional al 15 %", () => {
    expect(correr("calcular_impuestos", { rendimientos_financieros: 10_000_000, tipo_contribuyente: "juridica" }).j.impuesto_estimado).toBe("$ 3.500.000");
    // 10.000.000 × 35 % + 2.000.000 × 15 % = 3.800.000
    const go = correr("calcular_impuestos", { rendimientos_financieros: 10_000_000, utilidad_en_venta: 2_000_000, anios_tenencia: 3, tipo_contribuyente: "juridica" }).j;
    expect(go.impuesto_estimado).toBe("$ 3.800.000");
    expect(go.normas.join(" ")).toMatch(/Ganancia ocasional 15/);
  });

  it("con ingresos usa la tabla del art. 241 (28 % marginal para 100 millones)", () => {
    // 4.457.000 × 28 % = 1.247.960 (ingresos y base dentro del tramo 1.700–4.100 UVT)
    const j = correr("calcular_impuestos", { rendimientos_financieros: 10_000_000, ingresos_anuales: 100_000_000 }).j;
    expect(j.impuesto_estimado).toBe("$ 1.247.960");
    expect(j.tarifa).toMatch(/art\. 241/);
  });

  it("usa el perfil tributario del usuario por defecto", () => {
    const ctx = contexto({ perfil: { tipo: "juridica" }, params: null });
    expect(correr("calcular_impuestos", { rendimientos_financieros: 1_000_000 }, ctx).j.impuesto_estimado).toBe("$ 350.000");
  });

  it("valida la entrada", () => {
    expect(correr("calcular_impuestos", { rendimientos_financieros: "mucho" }).error).toBe(true);
    expect(correr("calcular_impuestos", { rendimientos_financieros: 1, tipo_contribuyente: "otro" }).error).toBe(true);
  });
});

describe("calcular_pyg", () => {
  it("título al vencimiento: mismas cifras que la ventana P&G (lib/pyg)", () => {
    const ctx = contexto();
    const t = ctx.titulo!;
    const e = entradasDesdeMotor(ctx.motor, t.b, t.o, { alVencimiento: true }, { ipc: SNAP_PRUEBA.datos.ipc, exp: SNAP_PRUEBA.datos.exp });
    if ("error" in e) throw new Error(e.error);
    const r = estadoPyG(e, PERFIL_INICIAL, PARAMETROS_OFICIALES);
    const { j, error } = correr("calcular_pyg", { sobre: "titulo_calculadora" }, ctx);
    expect(error).toBe(false);
    expect(j.frase).toBe(r.frase);
    expect(j.lineas).toHaveLength(r.lineas.length);
    expect(j.supuesto).toMatch(/vencimiento/);
  });

  it("portafolio vendido en un año y título vendido a otra tasa", () => {
    const pfR = correr("calcular_pyg", { sobre: "portafolio" }).j;
    expect(pfR.supuesto).toMatch(/Portafolio de 4 títulos/);
    expect(pfR.rentabilidad_real_ea).toMatch(/%$/);
    const venta = correr("calcular_pyg", { sobre: "titulo_calculadora", fecha_venta: "2027-11-04", tasa_venta_pct: 12 }).j;
    expect(venta.supuesto).toMatch(/12,000 %/);
  });
});

describe("Prompt y petición", () => {
  it("el prompt exige herramientas para impuestos, normas del conocimiento, requisitos y riesgos", () => {
    expect(SISTEMA_AGENTE).toMatch(/calcular_impuestos o calcular_pyg/);
    expect(SISTEMA_AGENTE).toMatch(/CONOCIMIENTO TRIBUTARIO/);
    expect(SISTEMA_AGENTE).toMatch(/requisitos, límites y riesgos/);
    expect(SISTEMA_AGENTE).toMatch(/depende del caso particular/);
    expect(sistemaVariable("moderado", "chat", contexto({ perfil: { tipo: "juridica" }, params: null }))).toMatch(/Persona jurídica/);
  });

  it("valida el perfil tributario: solo campos conocidos y en rango", () => {
    const r = validarPeticion({
      pregunta: "x",
      tributario: { perfil: { tipo: "juridica", ingresosAnuales: -5, tarifaManual: 0.28, raro: 1 }, params: { retencion: 0.04, uvt: 5, gmf: 0.004, hack: "x" } },
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.p.tributario).toEqual({ perfil: { tipo: "juridica", tarifaManual: 0.28 }, params: { retencion: 0.04, gmf: 0.004 } });
    const s = validarPeticion({ pregunta: "x" });
    if (!s.ok) throw new Error(s.error);
    expect(s.p.tributario).toBeNull();
  });
});
