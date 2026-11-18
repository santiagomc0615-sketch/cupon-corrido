/* Capa común del asesor de IA: elige el proveedor según las variables de entorno y devuelve un
   ProveedorIA con la misma interfaz para Anthropic y Gemini (correr en streaming con herramientas
   y traducir errores). La ruta /api/asesor solo habla con esta capa.
   - AI_PROVIDER: "gemini" o "anthropic". Si no se define: gemini si solo hay GEMINI_API_KEY; si no, anthropic.
   - GEMINI_API_KEY / ANTHROPIC_API_KEY: la clave del proveedor activo. Sin ella, modo demo.
   - AI_MODEL: modelo (por defecto gemini-3.8-flash, nivel gratuito con function calling; o
     claude-opus-5-5). ASESOR_MODELO se mantiene como alternativa para Anthropic. */
import { proveedorAnthropic } from "./anthropic";
import { proveedorGemini } from "./gemini";
import type { Esfuerzo, NombreProveedor, ProveedorIA } from "./tipos";

export { avisoPrivacidad, configIA, ETIQUETA_PROVEEDOR, MODELO_POR_DEFECTO, nombreProveedor } from "./config";

export type { BloquesSistema, EntradaAgente, ErrorIA, EventoAgente, NombreProveedor, ProveedorIA } from "./tipos";
export { MENSAJE_SATURADO } from "./tipos";

export function crearProveedor(o: { proveedor: NombreProveedor; modelo: string; maxTokens: number; esfuerzo: Esfuerzo }): ProveedorIA {
  return o.proveedor === "gemini" ? proveedorGemini(o) : proveedorAnthropic(o);
}
