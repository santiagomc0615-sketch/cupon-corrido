/* Verificación de la clave de administrador (ADMIN_KEY) para las cargas. Solo servidor. */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const hash = (s: string) => createHash("sha256").update(s).digest();

export function claveConfigurada(): boolean {
  return Boolean(process.env.ADMIN_KEY && process.env.ADMIN_KEY.length >= 8);
}

/** Compara en tiempo constante la clave enviada con ADMIN_KEY. */
export function claveValida(enviada: string | null): boolean {
  const real = process.env.ADMIN_KEY;
  if (!real || real.length < 8 || !enviada) return false;
  return timingSafeEqual(hash(enviada), hash(real));
}
