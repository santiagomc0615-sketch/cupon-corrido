/* Asesor de IA: recibe la pregunta, un historial corto y el contexto de mercado y portafolio,
   y responde en streaming (texto plano) con la API de Anthropic.
   - Clave en ANTHROPIC_API_KEY (.env.local / variables de Vercel). Nunca llega al navegador.
   - Límite: 20 consultas por hora por IP (lib/asesor/limite.ts). */
import Anthropic from "@anthropic-ai/sdk";
import { SYS } from "@/lib/asesor/contexto";
import { ipDe, revisarLimite } from "@/lib/asesor/limite";
import { validarPeticion } from "@/lib/asesor/peticion";

/** Modelo y esfuerzo configurables sin tocar código. */
const MODELO = process.env.ASESOR_MODELO || "claude-opus-5-5";
type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";
const ESFUERZO: Esfuerzo = (["low", "medium", "high", "xhigh", "max"] as const).includes(process.env.ASESOR_ESFUERZO as Esfuerzo)
  ? (process.env.ASESOR_ESFUERZO as Esfuerzo)
  : "medium";

/** Instrucción adicional para un chat: empezar a responder pronto. */
const SISTEMA = `${SYS}
Es un chat: empieza la respuesta visible de inmediato.`;

let cliente: Anthropic | null = null;
const anthropic = () => (cliente ??= new Anthropic());

const json = (cuerpo: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store", ...headers } });

function errorDeApi(e: unknown): Response {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return json({ error: "La clave de la API de Anthropic no es válida o no tiene permisos. Revise ANTHROPIC_API_KEY." }, 500);
  if (e instanceof Anthropic.NotFoundError) return json({ error: `El modelo «${MODELO}» no está disponible para esta cuenta.` }, 500);
  if (e instanceof Anthropic.RateLimitError) return json({ error: "El servicio de IA está recibiendo muchas consultas. Intente en un minuto." }, 503);
  if (e instanceof Anthropic.BadRequestError) return json({ error: "La consulta no es válida para la API: " + e.message }, 400);
  if (e instanceof Anthropic.APIError) return json({ error: `El servicio de IA respondió con un error (${e.status ?? "sin estado"}). Intente de nuevo.` }, 502);
  if (e instanceof Anthropic.APIConnectionError) return json({ error: "No hubo conexión con el servicio de IA. Intente de nuevo." }, 502);
  return json({ error: "No se pudo completar el análisis." }, 500);
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return json({ error: "El asesor no está configurado: falta ANTHROPIC_API_KEY en el servidor." }, 503);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }
  const v = validarPeticion(cuerpo);
  if (!v.ok) return json({ error: v.error }, 400);

  const limite = await revisarLimite(ipDe(req));
  const cabecerasLimite = { "X-Consultas-Restantes": String(limite.restantes) };
  if (!limite.permitido) {
    const minutos = Math.max(1, Math.ceil((limite.reinicio - Date.now()) / 60_000));
    return json(
      { error: `Alcanzó el límite de 20 consultas por hora. Podrá preguntar de nuevo en ${minutos} min.` },
      429,
      { ...cabecerasLimite, "Retry-After": String(minutos * 60) },
    );
  }

  const { pregunta, historial, contexto } = v.p;
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SISTEMA },
    {
      type: "text",
      text: `CONTEXTO (JSON, tasas en fracción decimal):\n${JSON.stringify(contexto ?? {})}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [...historial, { role: "user", content: pregunta }];

  const stream = anthropic().beta.messages.stream({
    model: MODELO,
    max_tokens: 16000,
    system,
    messages,
    output_config: { effort: ESFUERZO },
    // Si los filtros de seguridad declinan, la API reintenta en el modelo de respaldo recomendado.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  // Se espera el primer evento para devolver errores de la API (clave, modelo, límite) como JSON.
  const eventos = stream[Symbol.asyncIterator]();
  let primero: IteratorResult<Anthropic.Beta.BetaRawMessageStreamEvent>;
  try {
    primero = await eventos.next();
  } catch (e) {
    console.error("[asesor] Error al iniciar la respuesta:", e);
    return errorDeApi(e);
  }

  const cod = new TextEncoder();
  const cuerpoRespuesta = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const emitir = (ev: Anthropic.Beta.BetaRawMessageStreamEvent) => {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") ctrl.enqueue(cod.encode(ev.delta.text));
      };
      try {
        if (!primero.done) emitir(primero.value);
        for (;;) {
          const r = await eventos.next();
          if (r.done) break;
          emitir(r.value);
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal")
          ctrl.enqueue(cod.encode("\n\n_El asesor no puede responder esta consulta. Reformúlela en términos del curso._"));
        else if (final.stop_reason === "max_tokens") ctrl.enqueue(cod.encode("\n\n_(Respuesta recortada por longitud.)_"));
      } catch (e) {
        console.error("[asesor] Error durante la respuesta:", e);
        ctrl.enqueue(cod.encode("\n\n_Se interrumpió la respuesta. Intente de nuevo._"));
      } finally {
        ctrl.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(cuerpoRespuesta, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Modelo": MODELO,
      ...cabecerasLimite,
    },
  });
}
