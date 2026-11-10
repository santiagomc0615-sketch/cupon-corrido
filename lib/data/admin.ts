/* Verificación de la clave de administrador (ADMIN_KEY) para las cargas. Solo servidor. */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const hash = (s: string) => createHash("sha256").update(s).digest();

export function claveConfigurada(): boolean {
  return Boolean(process.env.ADMIN_KEY && process.env.ADMIN_KEY.length >= 8);
}

/** Compara en tiempo constante la clave enviada con una clave real (mínimo 8 caracteres). */
function coincide(enviada: string | null | undefined, real: string | undefined): boolean {
  if (!real || real.length < 8 || !enviada) return false;
  return timingSafeEqual(hash(enviada), hash(real));
}

/** Compara en tiempo constante la clave enviada con ADMIN_KEY. */
export function claveValida(enviada: string | null): boolean {
  return coincide(enviada, process.env.ADMIN_KEY);
}

/** Clave para forzar la actualización de datos: ACTUALIZAR_KEY o, si no se configuró, ADMIN_KEY. */
export function claveActualizarConfigurada(): boolean {
  return [process.env.ACTUALIZAR_KEY, process.env.ADMIN_KEY].some((k) => Boolean(k && k.length >= 8));
}

/** Acepta "Authorization: Bearer <clave>" con ACTUALIZAR_KEY o ADMIN_KEY. */
export function claveActualizarValida(autorizacion: string | null): boolean {
  const enviada = autorizacion?.startsWith("Bearer ") ? autorizacion.slice(7) : null;
  return coincide(enviada, process.env.ACTUALIZAR_KEY) || coincide(enviada, process.env.ADMIN_KEY);
}
