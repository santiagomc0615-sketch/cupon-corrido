/* Capa común de IA: elección del proveedor, mismas instrucciones y herramientas para ambos, y el
   bucle de Gemini con un cliente simulado (function calling, firmas de razonamiento, errores). */
import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { armarContexto } from "@/lib/asesor/agente";
import { DEFINICIONES_HERRAMIENTAS, ejecutarHerramienta, HERRAMIENTAS } from "@/lib/asesor/herramientas";
import { crearDefaults, crearPfEjemplo } from "@/lib/calculadora";
import { sistemaAnthropic } from "@/lib/ia/anthropic";
import { avisoPrivacidad, configIA } from "@/lib/ia/config";
import { correrGemini, traducirErrorGemini, type ClienteGemini } from "@/lib/ia/gemini";
import { herramientasGemini } from "@/lib/ia/herramientas";
import { bloquesSistema, SISTEMA_AGENTE, textoSistema } from "@/lib/ia/instrucciones";
import { MAX_VUELTAS, MENSAJE_SATURADO, type EventoAgente } from "@/lib/ia/tipos";
import { SNAP_PRUEBA } from "./snap-prueba";

const def = crearDefaults("2026-11-04");
const pf = crearPfEjemplo(def).map((p) => p.inputs);
const { ctx } = armarContexto(SNAP_PRUEBA, { titulo: def.TF, portafolio: { fecha: "2026-11-04", posiciones: pf }, fondeo: null });
const sistema = bloquesSistema("moderado", "chat", ctx, "Art. 241 E.T. …");

describe("Elección del proveedor (variables de entorno)", () => {
  it("AI_PROVIDER manda; el modelo por defecto depende del proveedor", () => {
    expect(configIA({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g" })).toEqual({ proveedor: "gemini", etiqueta: "Google (Gemini)", modelo: "gemini-3.8-flash", activo: true });
    expect(configIA({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" })).toMatchObject({ proveedor: "anthropic", modelo: "claude-opus-5-5", activo: true });
    expect(configIA({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g", AI_MODEL: "gemini-3.5-flash-lite" }).modelo).toBe("gemini-3.5-flash-lite");
    expect(configIA({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a", ASESOR_MODELO: "claude-sonnet-5-5" }).modelo).toBe("claude-sonnet-5-5");
  });

  it("solo cuenta la clave del proveedor activo (sin ella, modo demo)", () => {
    expect(configIA({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a" }).activo).toBe(false);
    expect(configIA({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "g" }).activo).toBe(false);
    expect(configIA({}).activo).toBe(false);
  });

  it("sin AI_PROVIDER: gemini si solo hay clave de Gemini; si no, anthropic", () => {
    expect(configIA({ GEMINI_API_KEY: "g" }).proveedor).toBe("gemini");
    expect(configIA({ ANTHROPIC_API_KEY: "a" }).proveedor).toBe("anthropic");
    expect(configIA({ AI_PROVIDER: "otro", GEMINI_API_KEY: "g" }).proveedor).toBe("gemini");
  });

  it("el aviso de privacidad nombra al proveedor activo", () => {
    expect(avisoPrivacidad("gemini")).toBe(
      "Las preguntas del asesor las procesa Google (Gemini); en el nivel gratuito de Google pueden usarse para mejorar sus productos. No escribas datos personales.",
    );
    expect(avisoPrivacidad("anthropic")).toMatch(/^Las preguntas del asesor las procesa Anthropic \(Claude\)\. No escribas datos personales\.$/);
  });
});

describe("Mismas instrucciones y herramientas para ambos proveedores", () => {
  it("el texto del sistema es el mismo: Anthropic lo recibe en bloques, Gemini unido", () => {
    expect(sistema.fijo).toBe(SISTEMA_AGENTE);
    const anthropic = sistemaAnthropic(sistema).map((b) => b.text);
    expect(anthropic).toEqual([sistema.fijo, sistema.conocimiento, sistema.variable]);
    expect(textoSistema(sistema)).toBe(anthropic.join("\n\n"));
    expect(textoSistema(sistema)).toMatch(/No calcules nada/);
    expect(textoSistema(sistema)).toMatch(/CONOCIMIENTO TRIBUTARIO/);
  });

  it("las quince herramientas se definen una vez y se traducen con el mismo esquema", () => {
    const g = herramientasGemini(DEFINICIONES_HERRAMIENTAS);
    expect(g.map((x) => x.name)).toEqual(HERRAMIENTAS.map((x) => x.name));
    expect(g).toHaveLength(15);
    for (const [i, x] of g.entries()) {
      expect(x.description).toBe(HERRAMIENTAS[i].description);
      expect(x.parametersJsonSchema).toEqual(HERRAMIENTAS[i].input_schema);
    }
  });
});

/* ---------- bucle de Gemini con cliente simulado ---------- */
type Trozo = { candidates?: { content?: { role: string; parts: Record<string, unknown>[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
function clienteFalso(vueltas: Trozo[][], error?: Error) {
  const peticiones: { model: string; contents: unknown[]; config: Record<string, unknown> }[] = [];
  let i = 0;
  const cliente = {
    models: {
      generateContentStream: async (p: { model: string; contents: unknown[]; config: Record<string, unknown> }) => {
        peticiones.push(structuredClone({ ...p, config: { ...p.config, abortSignal: undefined } }));
        if (error) throw error;
        const trozos = vueltas[Math.min(i++, vueltas.length - 1)];
        return (async function* () {
          for (const t of trozos) yield t;
        })();
      },
    },
  } as unknown as ClienteGemini;
  return { cliente, peticiones };
}
const trozo = (parts: Record<string, unknown>[], finishReason?: string): Trozo => ({ candidates: [{ content: { role: "model", parts }, ...(finishReason ? { finishReason } : {}) }] });
async function todos(g: AsyncGenerator<EventoAgente>) {
  const r: EventoAgente[] = [];
  for await (const e of g) r.push(e);
  return r;
}
const opciones = (cliente: ClienteGemini) => ({ cliente, modelo: "gemini-3.8-flash", maxTokens: 8000, esfuerzo: "medium" as const });
const entrada = { sistema, historial: [{ role: "user" as const, content: "Hola" }, { role: "assistant" as const, content: "¿En qué le ayudo?" }], pregunta: "Valórame un TES 2031 al 12 %", ctx };

describe("Bucle de Gemini (function calling)", () => {
  const args = { tipo: "TF", vencimiento: "2031-03-26", emision: "2020-03-26", cupon_o_spread_facial_pct: 7, tasa_compra_pct: 12 };

  it("ejecuta la función con el motor, reenvía las partes con su firma y sigue hasta el final", async () => {
    const { cliente, peticiones } = clienteFalso([
      [trozo([{ functionCall: { id: "c1", name: "valorar_titulo", args }, thoughtSignature: "firma-1" }], "STOP")],
      [trozo([{ text: "### TES 2031\n" }]), trozo([{ text: "- Precio según la herramienta" }], "STOP")],
    ]);
    const ev = await todos(correrGemini(opciones(cliente), entrada));
    expect(ev.filter((e) => e.t === "herramienta").map((e) => (e as { estado: string }).estado)).toEqual(["pidiendo", "listo"]);
    expect(ev.filter((e) => e.t === "texto").map((e) => (e as { d: string }).d).join("")).toBe("### TES 2031\n- Precio según la herramienta");
    expect(ev[ev.length - 1]).toEqual({ t: "fin", stop: "end_turn" });

    const [p0, p1] = peticiones;
    expect(p0.model).toBe("gemini-3.8-flash");
    expect(p0.config.systemInstruction).toBe(textoSistema(sistema));
    expect((p0.config.tools as { functionDeclarations: unknown[] }[])[0].functionDeclarations).toHaveLength(15);
    expect(p0.config.thinkingConfig).toEqual({ thinkingLevel: "MEDIUM" });
    expect(p0.contents).toEqual([
      { role: "user", parts: [{ text: "Hola" }] },
      { role: "model", parts: [{ text: "¿En qué le ayudo?" }] },
      { role: "user", parts: [{ text: "Valórame un TES 2031 al 12 %" }] },
    ]);
    // segunda vuelta: la llamada del modelo (con su firma) y la respuesta calculada por el motor
    const c = p1.contents as { role: string; parts: Record<string, unknown>[] }[];
    expect(c[3]).toEqual({ role: "model", parts: [{ functionCall: { id: "c1", name: "valorar_titulo", args }, thoughtSignature: "firma-1" }] });
    const resp = c[4].parts[0].functionResponse as { id: string; name: string; response: Record<string, string> };
    expect(resp).toMatchObject({ id: "c1", name: "valorar_titulo" });
    const directo = JSON.parse(ejecutarHerramienta("valorar_titulo", args, ctx).contenido);
    expect(resp.response.precio_sucio).toBe(directo.precio_sucio);
    expect(resp.response.tir).toBe("12,000 % E.A.");
  });

  it("una entrada inválida vuelve como error sin ejecutar el motor", async () => {
    const { cliente, peticiones } = clienteFalso([
      [trozo([{ functionCall: { name: "simular_escenario_tasas", args: { escenario: "paralelo" } } }], "STOP")],
      [trozo([{ text: "ok" }], "STOP")],
    ]);
    const ev = await todos(correrGemini(opciones(cliente), entrada));
    expect(ev.some((e) => e.t === "herramienta" && e.estado === "error")).toBe(true);
    const c = peticiones[1].contents as { parts: { functionResponse?: { response: { error?: string } } }[] }[];
    expect(c[c.length - 1].parts[0].functionResponse?.response.error).toBe("Entrada inválida");
  });

  it("no muestra el razonamiento interno del modelo", async () => {
    const { cliente } = clienteFalso([[trozo([{ text: "pensando…", thought: true }, { text: "Respuesta" }], "STOP")]]);
    const ev = await todos(correrGemini(opciones(cliente), entrada));
    expect(ev.filter((e) => e.t === "texto").map((e) => (e as { d: string }).d)).toEqual(["Respuesta"]);
  });

  it("bloqueo de seguridad → nota de rechazo; MAX_TOKENS → recortada", async () => {
    let r = await todos(correrGemini(opciones(clienteFalso([[trozo([], "SAFETY")]]).cliente), entrada));
    expect(r).toContainEqual({ t: "fin", stop: "refusal" });
    r = await todos(correrGemini(opciones(clienteFalso([[{ promptFeedback: { blockReason: "OTHER" } }]]).cliente), entrada));
    expect(r).toContainEqual({ t: "fin", stop: "refusal" });
    r = await todos(correrGemini(opciones(clienteFalso([[trozo([{ text: "a" }], "MAX_TOKENS")]]).cliente), entrada));
    expect(r).toContainEqual({ t: "fin", stop: "max_tokens" });
  });

  it("una llamada mal formada se repite una vez", async () => {
    const { cliente, peticiones } = clienteFalso([[trozo([], "MALFORMED_FUNCTION_CALL")], [trozo([{ text: "ok" }], "STOP")]]);
    const ev = await todos(correrGemini(opciones(cliente), entrada));
    expect(ev.some((e) => e.t === "reintento")).toBe(true);
    expect(ev[ev.length - 1]).toEqual({ t: "fin", stop: "end_turn" });
    expect(peticiones).toHaveLength(2);
  });

  it("se detiene tras el máximo de vueltas", async () => {
    const { cliente, peticiones } = clienteFalso([[trozo([{ functionCall: { name: "datos_mercado", args: {} } }], "STOP")]]);
    const ev = await todos(correrGemini(opciones(cliente), entrada));
    expect(peticiones).toHaveLength(MAX_VUELTAS);
    expect(ev[ev.length - 1]).toEqual({ t: "fin", stop: "max_vueltas" });
  });
});

describe("Errores de Gemini sin detalles técnicos", () => {
  it("cuota del nivel gratuito (429) o saturado (503) → «muy solicitado»", () => {
    for (const status of [429, 503]) {
      const t = traducirErrorGemini(new ApiError({ message: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}', status }), "gemini-3.8-flash");
      expect(t).toEqual({ tipo: "limite", status: 503, mensaje: MENSAJE_SATURADO });
    }
    expect(MENSAJE_SATURADO).toBe("El asesor está muy solicitado, intenta en un minuto.");
  });

  it("clave inválida, modelo inexistente y otros errores", () => {
    expect(traducirErrorGemini(new ApiError({ message: "API key not valid. Please pass a valid API key.", status: 400 }), "m")?.tipo).toBe("clave");
    expect(traducirErrorGemini(new ApiError({ message: "not found", status: 404 }), "m")?.mensaje).toMatch(/«m»/);
    const t = traducirErrorGemini(new ApiError({ message: "INTERNAL stack trace", status: 500 }), "m");
    expect(t?.mensaje).not.toMatch(/INTERNAL|stack/);
    expect(traducirErrorGemini(new Error("otro"), "m")).toBeNull();
  });
});
