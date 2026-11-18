/* Proveedor Anthropic (Claude) con tool use en streaming.
   - Bucle manual: cada vuelta transmite el texto; si el modelo pide herramientas, se ejecutan en el
     servidor, se devuelven todas en un solo mensaje y se sigue. Máximo MAX_VUELTAS.
   - Los bloques fijos del sistema (instrucciones y conocimiento tributario) van a la caché de prompts. */
import Anthropic from "@anthropic-ai/sdk";
import { ejecutarHerramienta, HERRAMIENTAS, type ContextoHerramientas } from "@/lib/asesor/herramientas";
import { MAX_VUELTAS, MENSAJE_SATURADO, type BloquesSistema, type Esfuerzo, type ErrorIA, type EventoAgente, type ProveedorIA } from "./tipos";

export interface OpcionesAgente {
  cliente: Pick<Anthropic, "beta">;
  modelo: string;
  maxTokens: number;
  esfuerzo: Esfuerzo;
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  ctx: ContextoHerramientas;
  signal?: AbortSignal;
}

const esErrorApi = (e: unknown) => e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError;

/** Ejecuta el agente y emite eventos. Los errores de la API se lanzan (la ruta los traduce). */
export async function* correrAgente(o: OpcionesAgente): AsyncGenerator<EventoAgente> {
  const messages = [...o.messages];
  let reintentos = 0;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = o.cliente.beta.messages.stream(
      {
        model: o.modelo,
        max_tokens: o.maxTokens,
        system: o.system,
        tools: HERRAMIENTAS,
        tool_choice: { type: "auto" },
        messages,
        output_config: { effort: o.esfuerzo },
        // Si los filtros de seguridad declinan, la API reintenta en el modelo de respaldo recomendado.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      o.signal ? { signal: o.signal } : undefined,
    );

    let final: Anthropic.Beta.BetaMessage;
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { t: "texto", d: ev.delta.text };
        else if (ev.type === "content_block_start" && ev.content_block.type === "tool_use")
          yield { t: "herramienta", id: ev.content_block.id, nombre: ev.content_block.name, estado: "pidiendo" };
      }
      final = await stream.finalMessage();
    } catch (e) {
      // Solo se repite si la entrada de una herramienta llegó mal formada (JSON incompleto).
      if (esErrorApi(e) || o.signal?.aborted || reintentos >= 1) throw e;
      reintentos++;
      vuelta--;
      yield { t: "reintento" };
      continue;
    }

    if (final.stop_reason === "refusal") {
      yield { t: "nota", d: "El asesor no puede responder esta consulta. Reformúlela en términos del curso." };
      yield { t: "fin", stop: "refusal" };
      return;
    }
    if (final.stop_reason === "max_tokens") {
      yield { t: "nota", d: "(Respuesta recortada por longitud.)" };
      yield { t: "fin", stop: "max_tokens" };
      return;
    }
    if (final.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    if (final.stop_reason !== "tool_use") {
      yield { t: "fin", stop: final.stop_reason ?? null };
      return;
    }

    const pedidos = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = pedidos.map((b) => {
      const r = ejecutarHerramienta(b.name, b.input, o.ctx);
      return { type: "tool_result", tool_use_id: b.id, content: r.contenido, ...(r.error ? { is_error: true } : {}) };
    });
    for (const [i, b] of pedidos.entries()) yield { t: "herramienta", id: b.id, nombre: b.name, estado: resultados[i].is_error ? "error" : "listo" };
    messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({ role: "user", content: resultados });
  }
  yield { t: "nota", d: "(El análisis necesitó demasiados pasos; pregunte algo más concreto.)" };
  yield { t: "fin", stop: "max_vueltas" };
}

/** Bloques del sistema para Anthropic: el mismo texto que recibe cualquier proveedor. */
export const sistemaAnthropic = (b: BloquesSistema): Anthropic.Beta.BetaTextBlockParam[] => [
  { type: "text", text: b.fijo },
  { type: "text", text: b.conocimiento, cache_control: { type: "ephemeral" } },
  { type: "text", text: b.variable },
];

export function traducirErrorAnthropic(e: unknown, modelo: string): ErrorIA | null {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return { tipo: "clave", status: 500, mensaje: "La clave de la API de Anthropic no es válida o no tiene permisos. Revise ANTHROPIC_API_KEY." };
  if (e instanceof Anthropic.NotFoundError) return { tipo: "modelo", status: 500, mensaje: `El modelo «${modelo}» no está disponible para esta cuenta.` };
  if (e instanceof Anthropic.RateLimitError) return { tipo: "limite", status: 503, mensaje: MENSAJE_SATURADO };
  if (e instanceof Anthropic.BadRequestError) return { tipo: "peticion", status: 400, mensaje: "La consulta no es válida para el asesor. Reformúlela e intente de nuevo." };
  if (e instanceof Anthropic.APIError)
    return (e.status ?? 0) === 529 || (e.status ?? 0) === 503
      ? { tipo: "limite", status: 503, mensaje: MENSAJE_SATURADO }
      : { tipo: "servicio", status: 502, mensaje: "El servicio de IA respondió con un error. Intente de nuevo." };
  if (e instanceof Anthropic.APIConnectionError) return { tipo: "conexion", status: 502, mensaje: "No hubo conexión con el servicio de IA. Intente de nuevo." };
  return null;
}

let cliente: Anthropic | null = null;

export function proveedorAnthropic(o: { modelo: string; maxTokens: number; esfuerzo: Esfuerzo; cliente?: Pick<Anthropic, "beta"> }): ProveedorIA {
  return {
    nombre: "anthropic",
    etiqueta: "Anthropic (Claude)",
    modelo: o.modelo,
    correr: (e) =>
      correrAgente({
        cliente: o.cliente ?? (cliente ??= new Anthropic()),
        modelo: o.modelo,
        maxTokens: o.maxTokens,
        esfuerzo: o.esfuerzo,
        system: sistemaAnthropic(e.sistema),
        messages: [...e.historial, { role: "user", content: e.pregunta }],
        ctx: e.ctx,
        signal: e.signal,
      }),
    traducirError: (e) => traducirErrorAnthropic(e, o.modelo),
  };
}
