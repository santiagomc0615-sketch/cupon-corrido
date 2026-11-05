/* Límite de consultas al asesor: 20 por hora por IP (ventana deslizante).
   - Con UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN: Upstash Redis, compartido entre
     todas las instancias de Vercel (recomendado en producción).
   - Sin ellas: contador en memoria del proceso (sirve en local; en Vercel cada instancia
     llevaría su propia cuenta). Solo servidor. */
import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { BRAND } from "@/lib/brand";
import { hayRedis } from "./redis";

export const CONSULTAS_POR_HORA = 20;
const HORA_MS = 60 * 60 * 1000;

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  /** Momento (ms desde 1970) en que se libera la siguiente consulta. */
  reinicio: number;
  /** "upstash" o "memoria" */
  almacen: string;
}

/* ---------- En memoria ---------- */
const historial = new Map<string, number[]>();

export function limiteEnMemoria(id: string, ahora = Date.now(), max = CONSULTAS_POR_HORA, ventana = HORA_MS): ResultadoLimite {
  const recientes = (historial.get(id) ?? []).filter((t) => t > ahora - ventana);
  const permitido = recientes.length < max;
  if (permitido) recientes.push(ahora);
  historial.set(id, recientes);
  // limpieza ocasional para que el mapa no crezca sin fin
  if (historial.size > 5000) for (const [k, v] of historial) if (!v.some((t) => t > ahora - ventana)) historial.delete(k);
  return {
    permitido,
    restantes: Math.max(0, max - recientes.length),
    reinicio: (recientes[0] ?? ahora) + ventana,
    almacen: "memoria",
  };
}

/* ---------- Upstash ---------- */
let upstash: Ratelimit | null | undefined;
function limitadorUpstash(max: number): Ratelimit | null {
  if (upstash !== undefined) return upstash;
  upstash = hayRedis()
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(max, "1 h"),
        prefix: `${BRAND.slug}:asesor`,
      })
    : null;
  return upstash;
}

export async function revisarLimite(ip: string, max = CONSULTAS_POR_HORA): Promise<ResultadoLimite> {
  const u = limitadorUpstash(max);
  if (!u) return limiteEnMemoria(ip, Date.now(), max);
  try {
    const r = await u.limit(ip);
    return { permitido: r.success, restantes: r.remaining, reinicio: r.reset, almacen: "upstash" };
  } catch (e) {
    console.warn("[asesor] Upstash no respondió; se usa el contador en memoria.", e);
    return limiteEnMemoria(ip, Date.now(), max);
  }
}

/** IP del cliente: primera de x-forwarded-for (Vercel), luego x-real-ip. */
export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  return ip || "local";
}
