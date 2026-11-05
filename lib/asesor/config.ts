/* Configuración del asesor de IA (solo servidor). Todo se controla con variables de entorno:
   - ANTHROPIC_API_KEY: sin ella el asesor funciona en modo demo (no llama a la API).
   - ASESOR_MODELO: modelo de Claude (por defecto claude-opus-5-5).
   - ASESOR_ESFUERZO: low | medium | high | xhigh | max (por defecto medium).
   - ASESOR_MAX_TOKENS: longitud máxima de cada respuesta, incluido el razonamiento (por defecto 8000).
   - ASESOR_CONSULTAS_HORA: consultas por hora por IP (por defecto 20). */
import "server-only";

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";
const ESFUERZOS: Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];

const entero = (v: string | undefined, porDefecto: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : porDefecto;
};

export function configAsesor() {
  const e = process.env.ASESOR_ESFUERZO as Esfuerzo;
  return {
    activo: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    modelo: process.env.ASESOR_MODELO || "claude-opus-5-5",
    esfuerzo: ESFUERZOS.includes(e) ? e : ("medium" as Esfuerzo),
    maxTokens: entero(process.env.ASESOR_MAX_TOKENS, 8000, 1024, 64000),
    consultasPorHora: entero(process.env.ASESOR_CONSULTAS_HORA, 20, 1, 1000),
  };
}

export { MENSAJE_DEMO } from "./contexto";

/** Horas que se guarda la respuesta de "Resumen de la economía". */
export const HORAS_CACHE_RESUMEN = 24;
