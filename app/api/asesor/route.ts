/* Asesor de IA como agente con herramientas. Recibe la pregunta, un historial corto, el perfil del
   cliente, el modo (chat, comité o informe) y las entradas del portafolio, del título de la
   calculadora y del fondeo. El servidor los valora con el motor y el modelo solo obtiene cifras
   llamando a las herramientas (lib/asesor/herramientas.ts).
   Responde en streaming NDJSON: una línea JSON por evento ({t:"texto"|"herramienta"|"reintento"|"nota"|"fin"}).
   - Sin ANTHROPIC_API_KEY funciona en modo demo: GET informa el estado y POST responde 503 con
     { demo: true } sin llamar a la API.
   - Control de costos (lib/asesor/config.ts): consultas por hora por IP, longitud máxima, modelo y
     esfuerzo por variables de entorno, y caché de 24 h para "Resumen de la economía". */
import Anthropic from "@anthropic-ai/sdk";
import { armarContexto, correrAgente, SISTEMA_AGENTE, sistemaVariable, type EventoAgente } from "@/lib/asesor/agente";
import { claveCache, guardarCache, leerCache } from "@/lib/asesor/cache";
import { configAsesor, HORAS_CACHE_RESUMEN, MENSAJE_DEMO } from "@/lib/asesor/config";
import { ipDe, revisarLimite } from "@/lib/asesor/limite";
import { validarPeticion } from "@/lib/asesor/peticion";
import { obtenerMercado } from "@/lib/data/mercado";

let cliente: Anthropic | null = null;
const anthropic = () => (cliente ??= new Anthropic());

const json = (cuerpo: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store", ...headers } });

const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" };
const linea = (e: EventoAgente) => JSON.stringify(e) + "\n";

function errorDeApi(e: unknown, modelo: string): Response {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return json({ error: "La clave de la API de Anthropic no es válida o no tiene permisos. Revise ANTHROPIC_API_KEY." }, 500);
  if (e instanceof Anthropic.NotFoundError) return json({ error: `El modelo «${modelo}» no está disponible para esta cuenta.` }, 500);
  if (e instanceof Anthropic.RateLimitError) return json({ error: "El servicio de IA está recibiendo muchas consultas. Intente en un minuto." }, 503);
  if (e instanceof Anthropic.BadRequestError) return json({ error: "La consulta no es válida para la API: " + e.message }, 400);
  if (e instanceof Anthropic.APIError) return json({ error: `El servicio de IA respondió con un error (${e.status ?? "sin estado"}). Intente de nuevo.` }, 502);
  if (e instanceof Anthropic.APIConnectionError) return json({ error: "No hubo conexión con el servicio de IA. Intente de nuevo." }, 502);
  return json({ error: "No se pudo completar el análisis." }, 500);
}

/** Estado del asesor para la interfaz (sin revelar la clave). */
export async function GET() {
  const c = configAsesor();
  return json(
    {
      activo: c.activo,
      mensajeDemo: c.activo ? null : MENSAJE_DEMO,
      modelo: c.activo ? c.modelo : null,
      consultasPorHora: c.consultasPorHora,
      horasCacheResumen: HORAS_CACHE_RESUMEN,
    },
    200,
  );
}

export async function POST(req: Request) {
  const cfg = configAsesor();
  if (!cfg.activo) return json({ error: MENSAJE_DEMO, demo: true }, 503);

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }
  const v = validarPeticion(cuerpo);
  if (!v.ok) return json({ error: v.error }, 400);
  const p = v.p;

  const snap = await obtenerMercado();

  // "Resumen de la economía": si ya se respondió con estos mismos datos de mercado, se reutiliza.
  const huella = { fecha: snap.fechaAnalisis, actualizado: snap.actualizado, curva: snap.datos.curveDate, tpm: snap.macro.tpm, perfil: p.perfil, modo: p.modo };
  const clave = p.rapida && p.historial.length === 0 ? claveCache(p.rapida, cfg.modelo, huella) : null;
  if (clave) {
    const guardada = await leerCache(clave);
    if (guardada)
      return new Response(linea({ t: "texto", d: guardada }) + linea({ t: "fin", stop: "end_turn" }), {
        headers: { ...NDJSON, "X-Asesor-Cache": "HIT", "X-Modelo": cfg.modelo },
      });
  }

  const limite = await revisarLimite(ipDe(req), cfg.consultasPorHora);
  const cabecerasLimite = { "X-Consultas-Restantes": String(limite.restantes) };
  if (!limite.permitido) {
    const minutos = Math.max(1, Math.ceil((limite.reinicio - Date.now()) / 60_000));
    return json(
      { error: `Alcanzó el límite de ${cfg.consultasPorHora} consultas por hora. Podrá preguntar de nuevo en ${minutos} min.` },
      429,
      { ...cabecerasLimite, "Retry-After": String(minutos * 60) },
    );
  }

  const { ctx, invalidas } = armarContexto(snap, p);
  const corte = new AbortController();
  const eventos = correrAgente({
    cliente: anthropic(),
    modelo: cfg.modelo,
    maxTokens: cfg.maxTokens,
    esfuerzo: cfg.esfuerzo,
    // El bloque fijo (y las herramientas, que van antes) se guarda en la caché de prompts.
    system: [
      { type: "text", text: SISTEMA_AGENTE, cache_control: { type: "ephemeral" } },
      { type: "text", text: sistemaVariable(p.perfil, p.modo, ctx, invalidas) },
    ],
    messages: [...p.historial, { role: "user", content: p.pregunta }],
    ctx,
    signal: corte.signal,
  });

  // Se espera el primer evento para devolver errores de la API (clave, modelo, límite) como JSON.
  let primero: IteratorResult<EventoAgente>;
  try {
    primero = await eventos.next();
  } catch (e) {
    console.error("[asesor] Error al iniciar la respuesta:", e);
    return errorDeApi(e, cfg.modelo);
  }

  const cod = new TextEncoder();
  const cuerpoRespuesta = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let completo = "";
      let fin: string | null = null;
      const emitir = (e: EventoAgente) => {
        if (e.t === "texto") completo += e.d;
        if (e.t === "reintento") completo = "";
        if (e.t === "fin") fin = e.stop;
        ctrl.enqueue(cod.encode(linea(e)));
      };
      try {
        if (!primero.done) emitir(primero.value);
        for (;;) {
          const r = await eventos.next();
          if (r.done) break;
          emitir(r.value);
        }
        if (clave && fin === "end_turn" && completo.trim()) await guardarCache(clave, completo);
      } catch (e) {
        console.error("[asesor] Error durante la respuesta:", e);
        emitir({ t: "nota", d: "Se interrumpió la respuesta. Intente de nuevo." });
        emitir({ t: "fin", stop: "error" });
      } finally {
        ctrl.close();
      }
    },
    cancel() {
      corte.abort();
      void eventos.return(undefined);
    },
  });

  return new Response(cuerpoRespuesta, {
    headers: { ...NDJSON, "X-Modelo": cfg.modelo, ...(clave ? { "X-Asesor-Cache": "MISS" } : {}), ...cabecerasLimite },
  });
}
