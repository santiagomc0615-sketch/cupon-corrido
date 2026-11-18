/* Elección del proveedor de IA por variables de entorno (sin importar los SDK: lo usan también
   las páginas legales para nombrar al proveedor activo). Detalle en lib/ia/proveedor.ts. */
import { PROVEEDORES, type NombreProveedor } from "./tipos";

export const MODELO_POR_DEFECTO: Record<NombreProveedor, string> = {
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-opus-5-5",
};

/** Respaldo de Gemini si el principal está saturado o sin cuota (también en el nivel gratuito). */
export const RESPALDO_GEMINI = ["gemini-3.8-flash", "gemini-4-hydrogen"];

export const ETIQUETA_PROVEEDOR: Record<NombreProveedor, string> = {
  gemini: "Google (Gemini)",
  anthropic: "Anthropic (Claude)",
};

type Entorno = Record<string, string | undefined>;

const claveDe = (p: NombreProveedor, env: Entorno) => (p === "gemini" ? Boolean(env.GEMINI_API_KEY) : Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN));

/** Proveedor elegido por AI_PROVIDER (o deducido de las claves que haya). */
export function nombreProveedor(env: Entorno = process.env): NombreProveedor {
  const pedido = (env.AI_PROVIDER ?? "").trim().toLowerCase() as NombreProveedor;
  if (PROVEEDORES.includes(pedido)) return pedido;
  return claveDe("gemini", env) && !claveDe("anthropic", env) ? "gemini" : "anthropic";
}

export function configIA(env: Entorno = process.env) {
  const proveedor = nombreProveedor(env);
  const modelo = env.AI_MODEL?.trim() || (proveedor === "anthropic" ? env.ASESOR_MODELO?.trim() : "") || MODELO_POR_DEFECTO[proveedor];
  const respaldos = (env.AI_MODEL_RESPALDO ?? (proveedor === "gemini" ? RESPALDO_GEMINI.join(",") : ""))
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== modelo);
  return { proveedor, etiqueta: ETIQUETA_PROVEEDOR[proveedor], modelo, respaldos, activo: claveDe(proveedor, env) };
}

/** Aviso de privacidad del asesor según el proveedor activo. */
export function avisoPrivacidad(p: NombreProveedor): string {
  return p === "gemini"
    ? "Las preguntas del asesor las procesa Google (Gemini); en el nivel gratuito de Google pueden usarse para mejorar sus productos. No escribas datos personales."
    : "Las preguntas del asesor las procesa Anthropic (Claude). No escribas datos personales.";
}
