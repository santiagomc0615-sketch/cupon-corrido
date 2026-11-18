/* Proveedor Google Gemini (SDK oficial @google/genai) con function calling en streaming.
   Mismo bucle que Anthropic: cada vuelta transmite el texto; si el modelo pide funciones, se ejecutan
   en el servidor con ejecutarHerramienta (motor validado) y se devuelven todas juntas.
   - Se reenvían las partes del modelo tal como llegaron (incluidas las firmas de razonamiento,
     thoughtSignature), como exige Gemini 3 para seguir con las llamadas a funciones.
   - Si el modelo responde 429 (cuota del nivel gratuito) o 503 (saturado), se intenta con los modelos
     de respaldo (AI_MODEL_RESPALDO; la cuota gratuita es por modelo). Si todos fallan →
     "El asesor está muy solicitado…". */
import { ApiError, FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponse, type Part } from "@google/genai";
import { DEFINICIONES_HERRAMIENTAS, ejecutarHerramienta } from "@/lib/asesor/herramientas";
import { herramientasGemini } from "./herramientas";
import { textoSistema } from "./instrucciones";
import { MAX_VUELTAS, MENSAJE_SATURADO, type EntradaAgente, type Esfuerzo, type ErrorIA, type EventoAgente, type ProveedorIA } from "./tipos";

/** Lo único del SDK que usa el bucle (permite probarlo con un cliente simulado). */
export interface ClienteGemini {
  models: { generateContentStream: GoogleGenAI["models"]["generateContentStream"] };
}

export interface OpcionesGemini {
  cliente: ClienteGemini;
  modelo: string;
  /** Modelos que se prueban, en orden, si el principal está saturado o sin cuota. */
  respaldos?: string[];
  maxTokens: number;
  esfuerzo: Esfuerzo;
}

/** Tiempo máximo de cada llamada a Gemini, incluida la lectura del stream (el SDK no trae límite). */
export const TIEMPO_MAXIMO_MS = 30_000;

/** Se venció el tiempo máximo de la llamada (Google no respondió). */
const esTiempoAgotado = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** 429 (cuota), 503 (saturado), 529 o sin respuesta a tiempo: conviene probar otro modelo o esperar. */
const esSaturado = (e: unknown) => (e instanceof ApiError && [429, 503, 529].includes(e.status)) || esTiempoAgotado(e);

const NIVEL: Record<Esfuerzo, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.HIGH,
  max: ThinkingLevel.HIGH,
};

const DECLARACIONES = herramientasGemini(DEFINICIONES_HERRAMIENTAS);
const BLOQUEO = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

const aObjeto = (contenido: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(contenido) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { resultado: v };
  } catch {
    return { resultado: contenido };
  }
};

export async function* correrGemini(o: OpcionesGemini, e: EntradaAgente): AsyncGenerator<EventoAgente> {
  const contents: Content[] = [
    ...e.historial.map((t): Content => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
    { role: "user", parts: [{ text: e.pregunta }] },
  ];
  const config = {
    systemInstruction: textoSistema(e.sistema),
    tools: [{ functionDeclarations: DECLARACIONES }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
    maxOutputTokens: o.maxTokens,
    thinkingConfig: { thinkingLevel: NIVEL[o.esfuerzo] },
    ...(e.signal ? { abortSignal: e.signal } : {}),
  };

  const modelos = [o.modelo, ...(o.respaldos ?? []).filter((m) => m && m !== o.modelo)];
  let actual = 0;
  const abrir = async (): Promise<AsyncGenerator<GenerateContentResponse>> => {
    for (;;) {
      try {
        return await o.cliente.models.generateContentStream({ model: modelos[actual], contents, config });
      } catch (err) {
        if (!esSaturado(err) || actual >= modelos.length - 1 || e.signal?.aborted) throw err;
        actual++; // el siguiente modelo de respaldo (se queda en él el resto de la consulta)
      }
    }
  };

  let reintentos = 0;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const stream = await abrir();
    const partes: Part[] = [];
    let fin: string | undefined;
    let bloqueado = false;
    try {
      for await (const ch of stream) {
        if (ch.promptFeedback?.blockReason) bloqueado = true;
        const c = ch.candidates?.[0];
        for (const p of c?.content?.parts ?? []) {
          partes.push(p);
          if (p.functionCall?.name) yield { t: "herramienta", id: p.functionCall.id ?? `g${vuelta}-${partes.length}`, nombre: p.functionCall.name, estado: "pidiendo" };
          else if (p.text && !p.thought) yield { t: "texto", d: p.text };
        }
        if (c?.finishReason) fin = c.finishReason;
      }
    } catch (err) {
      // Google puede cortar el stream a mitad (503, cuota o sin respuesta a tiempo): se descarta el
      // texto de esta vuelta y se repite con el siguiente modelo de respaldo.
      if (!esSaturado(err) || actual >= modelos.length - 1 || e.signal?.aborted) throw err;
      actual++;
      vuelta--;
      yield { t: "reintento" };
      continue;
    }

    if (bloqueado || (fin && BLOQUEO.has(fin))) {
      yield { t: "nota", d: "El asesor no puede responder esta consulta. Reformúlela en términos del curso." };
      yield { t: "fin", stop: "refusal" };
      return;
    }
    // Llamada a función mal formada: se repite la vuelta una vez.
    if (fin === "MALFORMED_FUNCTION_CALL" || fin === "UNEXPECTED_TOOL_CALL") {
      if (reintentos >= 1) {
        yield { t: "nota", d: "No se pudo completar el análisis. Intente de nuevo." };
        yield { t: "fin", stop: "error" };
        return;
      }
      reintentos++;
      vuelta--;
      yield { t: "reintento" };
      continue;
    }

    const llamadas = partes.filter((p) => p.functionCall?.name);
    if (!llamadas.length) {
      if (fin === "MAX_TOKENS") {
        yield { t: "nota", d: "(Respuesta recortada por longitud.)" };
        yield { t: "fin", stop: "max_tokens" };
      } else yield { t: "fin", stop: "end_turn" };
      return;
    }
    if (fin === "MAX_TOKENS") {
      yield { t: "nota", d: "(Respuesta recortada por longitud.)" };
      yield { t: "fin", stop: "max_tokens" };
      return;
    }

    const respuestas: Part[] = [];
    for (const [k, p] of llamadas.entries()) {
      const fc = p.functionCall!;
      const r = ejecutarHerramienta(fc.name!, fc.args ?? {}, e.ctx);
      yield { t: "herramienta", id: fc.id ?? `g${vuelta}-${k}`, nombre: fc.name!, estado: r.error ? "error" : "listo" };
      respuestas.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name!, response: aObjeto(r.contenido) } });
    }
    contents.push({ role: "model", parts: partes });
    contents.push({ role: "user", parts: respuestas });
  }
  yield { t: "nota", d: "(El análisis necesitó demasiados pasos; pregunte algo más concreto.)" };
  yield { t: "fin", stop: "max_vueltas" };
}

export function traducirErrorGemini(e: unknown, modelo: string): ErrorIA | null {
  if (esTiempoAgotado(e)) return { tipo: "limite", status: 503, mensaje: MENSAJE_SATURADO };
  if (!(e instanceof ApiError)) {
    if (e instanceof TypeError && /fetch/i.test(e.message)) return { tipo: "conexion", status: 502, mensaje: "No hubo conexión con el servicio de IA. Intente de nuevo." };
    return null;
  }
  const s = e.status;
  if (s === 429 || s === 503 || s === 529) return { tipo: "limite", status: 503, mensaje: MENSAJE_SATURADO };
  if (s === 401 || s === 403 || (s === 400 && /api key|api_key/i.test(e.message)))
    return { tipo: "clave", status: 500, mensaje: "La clave de Gemini no es válida o no tiene permisos. Revise GEMINI_API_KEY." };
  if (s === 404) return { tipo: "modelo", status: 500, mensaje: `El modelo «${modelo}» no está disponible para esta clave.` };
  if (s === 400) return { tipo: "peticion", status: 400, mensaje: "La consulta no es válida para el asesor. Reformúlela e intente de nuevo." };
  return { tipo: "servicio", status: 502, mensaje: "El servicio de IA respondió con un error. Intente de nuevo." };
}

let cliente: GoogleGenAI | null = null;

export function proveedorGemini(o: Omit<OpcionesGemini, "cliente"> & { cliente?: ClienteGemini }): ProveedorIA {
  return {
    nombre: "gemini",
    etiqueta: "Google (Gemini)",
    modelo: o.modelo,
    correr: (e) => correrGemini({ ...o, cliente: o.cliente ?? (cliente ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: TIEMPO_MAXIMO_MS } })) }, e),
    traducirError: (e) => traducirErrorGemini(e, o.modelo),
  };
}
