/* Asesor como agente con herramientas (tool use de la API de Anthropic).
   - El prompt de sistema obliga a sacar toda cifra de una herramienta (lib/asesor/herramientas.ts),
     que llama al motor validado contra el Excel. El modelo elige herramientas, lee y explica.
   - Bucle manual en streaming: cada vuelta transmite el texto; si el modelo pide herramientas, se
     ejecutan en el servidor, se devuelven todas en un solo mensaje y se sigue. Máximo MAX_VUELTAS.
   - armarContexto: valora con el motor el portafolio y el título que manda el navegador. */
import Anthropic from "@anthropic-ai/sdk";
import { CONFIG_INICIAL, type ConfigFondeo } from "@/lib/carry/config";
import { toEngine, type EntradasUI } from "@/lib/calculadora";
import type { SnapshotMercado } from "@/lib/data/mercado";
import { crearMotor, esError, type Motor } from "@/lib/engine";
import { ejecutarHerramienta, HERRAMIENTAS, type ContextoHerramientas, type NombreHerramienta, type PosicionAgente } from "./herramientas";
import { conOficiales } from "@/lib/impuestos/parametros";
import { NOMBRE_CONTRIBUYENTE, PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import type { Modo, PeticionAsesor, Perfil } from "./peticion";

export const MAX_VUELTAS = 8;

/* ---------- prompt ---------- */
export const SISTEMA_AGENTE = `Eres el asesor de una calculadora académica de renta fija colombiana (curso de Portafolio de Renta Fija). Respondes en español de Colombia, con criterio de analista de mesa de dinero, claro y estructurado.

Cifras: regla sin excepciones
- Toda cifra que escribas (tasas, precios, duraciones, DV01, montos, pb, porcentajes, fechas de datos) debe venir textualmente del resultado de una herramienta de esta conversación. Cópiala con el formato en que llega (coma decimal).
- No calcules nada tú mismo: ni sumas, restas, promedios, diferencias en pb, conversiones de tasa, proyecciones ni reglas de tres. Si necesitas una cifra que no está en un resultado, llama a la herramienta que la produce; si ninguna la produce, dilo sin inventarla.
- Antes de responder, llama a las herramientas que necesites; puedes pedir varias a la vez. Para hablar del mercado usa datos_mercado; del portafolio, resumen_portafolio; de un título, valorar_titulo; de escenarios, simular_escenario_tasas; de alternativas, comparar_opciones; de fondeo, carry y fondeo en dólares, analizar_fondeo; de impuestos, calcular_impuestos; del resultado de vender o mantener con impuestos e inflación, calcular_pyg; de la forma de la curva, spots y forwards, curva_tes; de inflación implícita y breakeven frente a la meta y las expectativas, inflacion_implicita; del retorno esperado, carry y roll-down a 30, 90, 180 o 365 días, retorno_esperado; de liquidez, potencial de valorización, spread o resultado desde la compra, analisis_titulo; de vender antes del vencimiento (TIR de la inversión), simular_venta; de los pagos que recibirá, flujos; de CDT vs. bonos con impuestos y escenarios, comparador_cdt_tes. Los datos globales (TRM, devaluación, SOFR, Tesoro de EE. UU., spread TES−UST, DTF) y las expectativas de inflación están en datos_mercado.
- Si el usuario pregunta qué puede hacer la calculadora o cómo funciona una sección, explícalo con estas mismas herramientas y nombra la sección de la página (pestañas: Resumen, Riesgo y sensibilidad, Flujos, Carry y fondeo, Venta y P&G, Análisis; páginas: Mercado, Curva TES, Portafolio, Asesor, Noticias, Cargar datos).
- Cita la fuente y la fecha que trae cada resultado (BanRep, DANE, Fed de Nueva York, datos.gov.co, curva TES del día).
- Si una herramienta devuelve un error, explícalo en palabras simples y sigue con lo que sí tengas.

Impuestos y planeación tributaria
- Las cifras de impuestos salen solo de calcular_impuestos o calcular_pyg (usan los parámetros verificados y el perfil tributario del usuario). Si el usuario da otro perfil o sus ingresos, pásalos a la herramienta.
- Las normas, requisitos y alternativas salen solo del bloque CONOCIMIENTO TRIBUTARIO. Cita la norma y su enlace oficial tal como aparecen allí. Si algo no está en ese bloque, dilo y remite a un contador; no lo completes de memoria.
- Al explicar alternativas legales (fondos de inversión colectiva, pensiones voluntarias, cuentas AFC, momento de la venta según el año gravable y la tenencia), da para cada una sus requisitos, límites y riesgos (permanencia, pérdida del beneficio, riesgo de mercado), no solo el beneficio. No prometas ahorros ni recomiendes evadir o simular operaciones.
- Aclara cuando el resultado depende del caso particular: otros ingresos del año, cupo del art. 336, si el título es activo fijo o inventario, calidad de obligado a contabilidad, entre otros.
- Cuando hables de impuestos, cierra con: «Estimación con fines académicos. No constituye asesoría tributaria; confirme con un contador.»

Criterio
- Explica el porqué con conceptos del curso: duración, convexidad, carry, roll-down, spread contra TES, tasa real, Fisher, riesgo de reinversión, fondeo y cobertura cambiaria.
- Da escenarios y alternativas ajustados al perfil del cliente, no órdenes de compra o venta.
- Cierra siempre con una línea: «Herramienta académica, no es asesoría financiera.»

Formato: títulos cortos con "### ", viñetas con "- ", negritas con **. Sin tablas. Máximo ~400 palabras salvo que pidan más.`;

const PERFIL: Record<Perfil, string> = {
  conservador:
    "Perfil del cliente: CONSERVADOR. Prioriza preservar el capital y la liquidez: duración corta, títulos indexados (IBR) o protegidos contra inflación, poca o ninguna palanca de fondeo, sin descalce cambiario. Destaca las pérdidas en los escenarios adversos.",
  moderado:
    "Perfil del cliente: MODERADO. Busca equilibrio entre rentabilidad y riesgo: duración media, mezcla de tasa fija e indexados, fondeo con haircut prudente y cobertura si hay deuda en dólares.",
  agresivo:
    "Perfil del cliente: AGRESIVO. Acepta volatilidad por mayor retorno esperado: puede tomar duración larga si espera bajas de tasas, apalancarse con fondeo y evaluar fondeo en dólares sin cubrir, siempre mostrando el escenario adverso y el colchón.",
};

const MODO: Record<Modo, string> = {
  chat: "Modo: conversación. Responde la pregunta directamente.",
  comite: `Modo: COMITÉ DE INVERSIÓN. Analiza la propuesta o pregunta como un comité. Llama a las herramientas necesarias para sustentar ambos lados (incluye al menos un escenario adverso con simular_escenario_tasas). Responde exactamente con estas secciones:
### Propuesta
### Caso a favor
### Caso en contra
### Conclusión del comité
En la conclusión di qué haría el comité para este perfil y qué condición la cambiaría.`,
  informe: `Modo: INFORME PARA EL CLIENTE. Escribe un informe breve en lenguaje sencillo (el cliente no es experto), sustentado con resumen_portafolio, datos_mercado y al menos un escenario de simular_escenario_tasas. Responde exactamente con estas secciones:
### Resumen
### Su portafolio hoy
### Contexto del mercado
### Qué pasaría si cambian las tasas
### Recomendación según su perfil
### Riesgos a tener en cuenta
Termina con: «Herramienta académica, no es asesoría financiera. Respuestas generadas por IA.»`,
};

/** Bloque variable del sistema: perfil, modo y qué hay cargado (solo nombres, ninguna cifra). */
export function sistemaVariable(perfil: Perfil, modo: Modo, ctx: Pick<ContextoHerramientas, "fecha" | "portafolio" | "titulo" | "tributario">, invalidas = 0): string {
  const trib = ctx.tributario?.perfil ?? PERFIL_INICIAL;
  const pf = ctx.portafolio.length ? ctx.portafolio.map((x) => x.titulo).join("; ") : "vacío";
  return [
    PERFIL[perfil],
    MODO[modo],
    `Fecha de análisis: ${ctx.fecha}.`,
    `Título abierto en la calculadora: ${ctx.titulo ? ctx.titulo.titulo : "ninguno válido"}.`,
    `Portafolio del usuario (${ctx.portafolio.length} posiciones): ${pf}.`,
    invalidas ? `${invalidas} posición(es) no se pudieron valorar y no están en las herramientas.` : "",
    `Perfil tributario del usuario: ${NOMBRE_CONTRIBUYENTE[trib.tipo]}, ${trib.tipo === "juridica" ? "tarifa de personas jurídicas" : trib.ingresosAnuales != null ? "con sus ingresos anuales cargados (tabla del art. 241)" : "con una tarifa marginal ingresada"}${trib.gmf ? ", incluye GMF" : ""}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---------- contexto ---------- */
function valorarEntradas(motor: Motor, e: EntradasUI, fecha: string): PosicionAgente | null {
  const b = toEngine({ ...e, valoracion: fecha });
  const o = motor.price(b);
  return esError(o) ? null : { titulo: String(e.nombre || `${e.tipo} ${e.vencimiento}`), b, o };
}

/** Arma el contexto de las herramientas con el motor del día y lo que mandó el navegador. */
export function armarContexto(snap: SnapshotMercado, p: Pick<PeticionAsesor, "titulo" | "portafolio" | "fondeo"> & Partial<Pick<PeticionAsesor, "tributario" | "uvr">>) {
  const motor = crearMotor(snap.datos);
  const fecha = snap.fechaAnalisis;
  const fechaPf = p.portafolio.fecha ?? fecha;
  const valoradas = p.portafolio.posiciones.map((e) => valorarEntradas(motor, e, fechaPf));
  const portafolio = valoradas.filter((x): x is PosicionAgente => x != null);
  const titulo = p.titulo ? valorarEntradas(motor, p.titulo, String(p.titulo.valoracion || fecha)) : null;
  const f = p.fondeo;
  const fondeo: ConfigFondeo | null = f ? { ...CONFIG_INICIAL, ...f, exterior: { ...CONFIG_INICIAL.exterior, ...(f.exterior ?? {}) } } : null;
  const tributario = { perfil: { ...PERFIL_INICIAL, ...(p.tributario?.perfil ?? {}) }, params: conOficiales(p.tributario?.params) };
  const ctx: ContextoHerramientas = { motor, snap, fecha, portafolio, titulo, fondeo, tributario, uvr: p.uvr ?? null };
  return { ctx, invalidas: valoradas.length - portafolio.length };
}

/* ---------- bucle ---------- */
export type EventoAgente =
  | { t: "texto"; d: string }
  | { t: "herramienta"; id: string; nombre: NombreHerramienta | string; estado: "pidiendo" | "listo" | "error" }
  /** La vuelta se repitió (entrada de herramienta mal formada): descartar el texto de esa vuelta. */
  | { t: "reintento" }
  | { t: "nota"; d: string }
  | { t: "fin"; stop: string | null };

export interface OpcionesAgente {
  cliente: Pick<Anthropic, "beta">;
  modelo: string;
  maxTokens: number;
  esfuerzo: "low" | "medium" | "high" | "xhigh" | "max";
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
