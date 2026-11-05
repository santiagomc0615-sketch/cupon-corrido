/* Validación de la petición al asesor (función pura, se prueba sin red). */

export interface TurnoHistorial {
  role: "user" | "assistant";
  content: string;
}

/** Consultas rápidas cuya respuesta no depende del portafolio y se puede guardar en caché. */
export const RAPIDAS_CACHEABLES = ["resumen"] as const;
export type RapidaCacheable = (typeof RAPIDAS_CACHEABLES)[number];

export interface PeticionAsesor {
  /** Consulta rápida cacheable, si la pregunta es una de ellas. */
  rapida?: RapidaCacheable;
  pregunta: string;
  /** Turnos anteriores (solo texto), los más recientes. */
  historial: TurnoHistorial[];
  /** Resumen de mercado y portafolio (ctxSnapshot). */
  contexto: unknown;
}

export const LIMITES = {
  pregunta: 2000,
  turnos: 6,
  turno: 6000,
  contexto: 40_000,
};

export function validarPeticion(cuerpo: unknown): { ok: true; p: PeticionAsesor } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== "object") return { ok: false, error: "Petición inválida." };
  const c = cuerpo as Record<string, unknown>;
  const pregunta = typeof c.pregunta === "string" ? c.pregunta.trim() : "";
  if (!pregunta) return { ok: false, error: "Escribe una pregunta." };
  if (pregunta.length > LIMITES.pregunta) return { ok: false, error: `La pregunta es muy larga (máximo ${LIMITES.pregunta} caracteres).` };

  const crudo = Array.isArray(c.historial) ? c.historial : [];
  const historial: TurnoHistorial[] = [];
  for (const t of crudo.slice(-LIMITES.turnos)) {
    const r = t as Record<string, unknown>;
    if ((r.role !== "user" && r.role !== "assistant") || typeof r.content !== "string" || !r.content.trim()) continue;
    historial.push({ role: r.role, content: r.content.slice(0, LIMITES.turno) });
  }
  // La conversación debe empezar con el usuario y alternar roles.
  while (historial.length && historial[0].role !== "user") historial.shift();
  const alternado = historial.filter((t, i) => i === 0 || t.role !== historial[i - 1].role);
  if (alternado.length && alternado[alternado.length - 1].role === "user") alternado.pop();

  let contexto: unknown = null;
  if (c.contexto != null) {
    const texto = JSON.stringify(c.contexto);
    if (texto.length > LIMITES.contexto) return { ok: false, error: "El contexto enviado es demasiado grande." };
    contexto = c.contexto;
  }
  const rapida = RAPIDAS_CACHEABLES.find((r) => r === c.rapida);
  return { ok: true, p: { pregunta, historial: alternado, contexto, ...(rapida ? { rapida } : {}) } };
}
