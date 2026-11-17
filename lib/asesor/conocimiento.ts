/* Conocimiento tributario verificado (lib/impuestos/conocimiento.md) para el contexto del asesor.
   Se lee una vez del archivo; next.config incluye el archivo en la función de /api/asesor. */
import { readFileSync } from "node:fs";
import path from "node:path";

let cache: string | null = null;

export function conocimientoTributario(): string {
  if (cache != null) return cache;
  try {
    cache = readFileSync(path.join(process.cwd(), "lib", "impuestos", "conocimiento.md"), "utf8");
  } catch (e) {
    console.warn("[asesor] No se pudo leer lib/impuestos/conocimiento.md:", e);
    cache = "";
  }
  return cache;
}
