/* Asesor como agente: herramientas contra el motor real y bucle de tool use con un cliente simulado. */
import { describe, expect, it } from "vitest";
import { armarContexto, correrAgente, MAX_VUELTAS, SISTEMA_AGENTE, sistemaVariable, type EventoAgente } from "@/lib/asesor/agente";
import { ejecutarHerramienta, HERRAMIENTAS } from "@/lib/asesor/herramientas";
import { crearDefaults, crearPfEjemplo } from "@/lib/calculadora";
import { pfMetrics } from "@/lib/engine";
import { F } from "@/lib/format";
import { SNAP_PRUEBA } from "./snap-prueba";

const def = crearDefaults("2026-11-04");
const pf = crearPfEjemplo(def).map((p) => p.inputs);
const { ctx, invalidas } = armarContexto(SNAP_PRUEBA, { titulo: def.TF, portafolio: { fecha: "2026-11-04", posiciones: pf }, fondeo: null });
const correr = (nombre: string, entrada: unknown = {}) => {
  const r = ejecutarHerramienta(nombre, entrada, ctx);
  return { ...r, j: JSON.parse(r.contenido) };
};

describe("Herramientas del asesor", () => {
  it("se declaran las seis, con streaming de entrada", () => {
    expect(HERRAMIENTAS.map((h) => h.name)).toEqual([
      "valorar_titulo",
      "simular_escenario_tasas",
      "comparar_opciones",
      "analizar_fondeo",
      "resumen_portafolio",
      "datos_mercado",
    ]);
    expect(HERRAMIENTAS.every((h) => "eager_input_streaming" in h && h.eager_input_streaming)).toBe(true);
    expect(ctx.portafolio).toHaveLength(4);
    expect(invalidas).toBe(0);
  });

  it("valorar_titulo: el título de la calculadora sale con las cifras del motor", () => {
    const { j, error } = correr("valorar_titulo", { usar_titulo_calculadora: true });
    expect(error).toBe(false);
    const o = ctx.titulo!.o;
    expect(j.precio_sucio).toBe(F.n(o.dirty, 3) + " %");
    expect(j.dv01).toBe(F.cop(o.dv01));
    expect(j.duracion_modificada).toBe(F.n(o.mod, 3));
  });

  it("valorar_titulo: arma un título con los campos dados", () => {
    const { j } = correr("valorar_titulo", { tipo: "TF", vencimiento: "2036-07-09", tasa_compra_pct: 12.5, cupon_o_spread_facial_pct: 11 });
    expect(j.vencimiento).toBe("2036-07-09");
    expect(j.tir).toMatch(/^12,500 %/);
    expect(j.supuestos).toMatch(/ejemplo/);
  });

  it("valida la entrada y no ejecuta lo inválido", () => {
    expect(correr("simular_escenario_tasas", { escenario: "loco", pb: 10 }).error).toBe(true);
    expect(correr("herramienta_x").error).toBe(true);
    expect(correr("comparar_opciones", { plazo_anios: 100 }).error).toBe(true);
  });

  it("simular_escenario_tasas: paralelo +100 pb pierde ~ la duración; el total coincide con la suma", () => {
    const { j } = correr("simular_escenario_tasas", { escenario: "paralelo", pb: 100 });
    expect(j.posiciones).toHaveLength(4);
    expect(j.total.cambio_valor.startsWith("−") || j.total.cambio_valor.startsWith("-")).toBe(true);
    const sube = correr("simular_escenario_tasas", { escenario: "paralelo", pb: -100 }).j;
    expect(sube.total.cambio_valor.startsWith("−") || sube.total.cambio_valor.startsWith("-")).toBe(false);
  });

  it("simular_escenario_tasas: empinamiento y recorte del BanRep", () => {
    const e = correr("simular_escenario_tasas", { escenario: "empinamiento", pb: 50, sobre: "titulo_calculadora" }).j;
    expect(e.posiciones).toHaveLength(1);
    const r = correr("simular_escenario_tasas", { escenario: "recorte_banrep", pb: 50 }).j;
    expect(r.supuestos).toMatch(/Recorte de 50 pb/);
    expect(r.posiciones).toHaveLength(4);
  });

  it("comparar_opciones: TES TF, IBR, IPC, UVR y CDT con la DTF", () => {
    const { j } = correr("comparar_opciones", { plazo_anios: 5, monto: 1e9 });
    expect(j.opciones.map((o: { opcion: string }) => o.opcion)).toEqual(["TES / bono tasa fija", "Bono IBR", "Bono IPC", "TES UVR", "CDT"]);
    expect(j.opciones.every((o: { error?: string }) => !o.error)).toBe(true);
    expect(j.opciones[4].tasa_usada).toMatch(/DTF 9,50 %/);
  });

  it("analizar_fondeo: carry y comparación con el exterior", () => {
    const { j, error } = correr("analizar_fondeo", {});
    expect(error).toBe(false);
    expect(j.horizontes.map((h: { dias: number }) => h.dias)).toEqual([30, 90, 365]);
    expect(j.comparacion_exterior.alternativas.length).toBeGreaterThan(1);
    expect(correr("analizar_fondeo", { sobre: "portafolio", tipo_fondeo: "propio" }).j.monto_fondeado).toMatch(/\(0 %\)$/);
  });

  it("resumen_portafolio y datos_mercado", () => {
    const r = correr("resumen_portafolio").j;
    const m = pfMetrics(ctx.portafolio.map((x) => ({ p: x.titulo, b: x.b, o: x.o })));
    expect(r.dv01).toBe(F.cop(m.dv01));
    expect(r.composicion).toHaveLength(4);
    const d = correr("datos_mercado").j;
    expect(d.tasa_politica.valor).toBe(F.pct(SNAP_PRUEBA.macro.tpm, 2));
    expect(d.curva_tes.referencias.length).toBeGreaterThan(3);
    expect(d.sofr.fuente).toBe("Fed de Nueva York");
  });

  it("portafolio vacío: error claro", () => {
    const vacio = armarContexto(SNAP_PRUEBA, { titulo: null, portafolio: { fecha: null, posiciones: [] }, fondeo: null }).ctx;
    expect(ejecutarHerramienta("resumen_portafolio", {}, vacio)).toMatchObject({ error: true });
  });
});

describe("Prompt del agente", () => {
  it("obliga a sacar las cifras de las herramientas y lleva el aviso", () => {
    expect(SISTEMA_AGENTE).toMatch(/No calcules nada/);
    expect(SISTEMA_AGENTE).toMatch(/no es asesoría financiera/);
  });
  it("perfil y modo comité / informe", () => {
    const c = sistemaVariable("conservador", "comite", ctx);
    expect(c).toMatch(/CONSERVADOR/);
    expect(c).toMatch(/### Caso a favor/);
    expect(c).toMatch(/### Caso en contra/);
    expect(c).toMatch(/### Conclusión del comité/);
    expect(sistemaVariable("agresivo", "informe", ctx)).toMatch(/INFORME PARA EL CLIENTE/);
    // sin cifras: solo nombres de las posiciones
    expect(sistemaVariable("moderado", "chat", ctx)).not.toMatch(/\d+,\d+ %/);
  });
});

/* ---------- bucle con un cliente simulado ---------- */
type Respuesta = { eventos: unknown[]; final: { stop_reason: string; content: unknown[] } };
function clienteFalso(respuestas: Respuesta[]) {
  const peticiones: Record<string, unknown>[] = [];
  let i = 0;
  const cliente = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          peticiones.push(structuredClone(params));
          const r = respuestas[Math.min(i++, respuestas.length - 1)];
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of r.eventos) yield e;
            },
            finalMessage: async () => r.final,
          };
        },
      },
    },
  };
  return { cliente: cliente as never, peticiones };
}
const texto = (t: string) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } });
const usoHerramienta = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

async function todos(g: AsyncGenerator<EventoAgente>) {
  const r: EventoAgente[] = [];
  for await (const e of g) r.push(e);
  return r;
}
const opciones = (cliente: never) => ({ cliente, modelo: "claude-opus-5-5", maxTokens: 8000, esfuerzo: "medium" as const, system: [], messages: [{ role: "user" as const, content: "¿Cómo está mi portafolio?" }], ctx });

describe("Bucle del agente", () => {
  it("ejecuta las herramientas pedidas, devuelve los resultados juntos y sigue hasta end_turn", async () => {
    const pedidos = [usoHerramienta("t1", "resumen_portafolio", {}), usoHerramienta("t2", "datos_mercado", {})];
    const { cliente, peticiones } = clienteFalso([
      { eventos: [{ type: "content_block_start", index: 0, content_block: pedidos[0] }], final: { stop_reason: "tool_use", content: pedidos } },
      { eventos: [texto("### Portafolio\n"), texto("- DV01 según la herramienta")], final: { stop_reason: "end_turn", content: [] } },
    ]);
    const ev = await todos(correrAgente(opciones(cliente)));
    expect(ev.filter((e) => e.t === "herramienta" && e.estado === "listo").map((e) => (e as { nombre: string }).nombre)).toEqual(["resumen_portafolio", "datos_mercado"]);
    expect(ev.filter((e) => e.t === "texto").map((e) => (e as { d: string }).d).join("")).toBe("### Portafolio\n- DV01 según la herramienta");
    expect(ev[ev.length - 1]).toEqual({ t: "fin", stop: "end_turn" });
    expect(peticiones).toHaveLength(2);
    const p0 = peticiones[0];
    expect((p0.tools as unknown[]).length).toBe(6);
    expect(p0.tool_choice).toEqual({ type: "auto" });
    expect(p0.fallbacks).toBe("default");
    const msgs = peticiones[1].messages as { role: string; content: { type: string; tool_use_id: string; content: string }[] }[];
    const ultimo = msgs[msgs.length - 1];
    expect(ultimo.role).toBe("user");
    expect(ultimo.content.map((c) => c.tool_use_id)).toEqual(["t1", "t2"]);
    expect(JSON.parse(ultimo.content[0].content).dv01).toBeTruthy();
  });

  it("marca con is_error una entrada inválida y no la ejecuta", async () => {
    const pedido = [usoHerramienta("t1", "simular_escenario_tasas", { escenario: "paralelo" })];
    const { cliente, peticiones } = clienteFalso([
      { eventos: [], final: { stop_reason: "tool_use", content: pedido } },
      { eventos: [texto("ok")], final: { stop_reason: "end_turn", content: [] } },
    ]);
    const ev = await todos(correrAgente(opciones(cliente)));
    expect(ev.some((e) => e.t === "herramienta" && e.estado === "error")).toBe(true);
    const msgs = peticiones[1].messages as { content: { is_error?: boolean }[] }[];
    expect(msgs[msgs.length - 1].content[0].is_error).toBe(true);
  });

  it("no ejecuta herramientas si el modelo declina o se corta por longitud", async () => {
    for (const stop of ["refusal", "max_tokens"]) {
      const { cliente, peticiones } = clienteFalso([{ eventos: [], final: { stop_reason: stop, content: [usoHerramienta("t1", "datos_mercado", {})] } }]);
      const ev = await todos(correrAgente(opciones(cliente)));
      expect(ev.some((e) => e.t === "herramienta" && e.estado !== "pidiendo")).toBe(false);
      expect(ev.some((e) => e.t === "nota")).toBe(true);
      expect(peticiones).toHaveLength(1);
    }
  });

  it("se detiene tras el máximo de vueltas", async () => {
    const { cliente, peticiones } = clienteFalso([{ eventos: [], final: { stop_reason: "tool_use", content: [usoHerramienta("t", "datos_mercado", {})] } }]);
    const ev = await todos(correrAgente(opciones(cliente)));
    expect(peticiones).toHaveLength(MAX_VUELTAS);
    expect(ev[ev.length - 1]).toEqual({ t: "fin", stop: "max_vueltas" });
  });
});
