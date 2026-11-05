/* Caché de respuestas del asesor para consultas que no dependen del portafolio
   (hoy: "Resumen de la economía"), 24 horas. La clave incluye un resumen (hash) de los datos de
   mercado, así que si cambian los datos se genera una respuesta nueva.
   - Con Upstash Redis configurado: compartida entre instancias.
   - Sin él: en memoria del proceso. Solo servidor. */
import "server-only";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { BRAND } from "@/lib/brand";
import { HORAS_CACHE_RESUMEN } from "./config";
import { hayRedis } from "./redis";

const TTL_S = HORAS_CACHE_RESUMEN * 3600;
const memoria = new Map<string, { texto: string; vence: number }>();

let redis: Redis | null | undefined;
function cliente(): Redis | null {
  if (redis !== undefined) return redis;
  redis = hayRedis() ? Redis.fromEnv() : null;
  return redis;
}

/** Clave a partir de la consulta, el modelo y el contexto de mercado (sin el portafolio). */
export function claveCache(consulta: string, modelo: string, contexto: unknown): string {
  const sinPortafolio = contexto && typeof contexto === "object" ? { ...(contexto as Record<string, unknown>), portafolio: null } : contexto;
  const h = createHash("sha256").update(JSON.stringify([consulta, modelo, sinPortafolio])).digest("hex").slice(0, 24);
  return `${BRAND.slug}:asesor:cache:${consulta}:${h}`;
}

export async function leerCache(clave: string, ahora = Date.now()): Promise<string | null> {
  const r = cliente();
  if (r) {
    try {
      return (await r.get<string>(clave)) ?? null;
    } catch (e) {
      console.warn("[asesor] Upstash no respondió al leer la caché.", e);
    }
  }
  const m = memoria.get(clave);
  if (!m) return null;
  if (m.vence <= ahora) {
    memoria.delete(clave);
    return null;
  }
  return m.texto;
}

export async function guardarCache(clave: string, texto: string, ahora = Date.now()): Promise<void> {
  memoria.set(clave, { texto, vence: ahora + TTL_S * 1000 });
  if (memoria.size > 200) for (const [k, v] of memoria) if (v.vence <= ahora) memoria.delete(k);
  const r = cliente();
  if (r) {
    try {
      await r.set(clave, texto, { ex: TTL_S });
    } catch (e) {
      console.warn("[asesor] Upstash no respondió al guardar la caché.", e);
    }
  }
}
