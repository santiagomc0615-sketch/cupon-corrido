/* ¿Hay Upstash Redis configurado? Acepta los nombres de Upstash (UPSTASH_REDIS_REST_*) y los que
   crea la integración de Vercel (KV_REST_API_*), igual que Redis.fromEnv(). Solo servidor. */
import "server-only";

export function hayRedis(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}
