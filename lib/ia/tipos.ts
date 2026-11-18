/* Tipos comunes de la capa de IA: el resto de la página habla con un ProveedorIA y no sabe si detrás
   está Anthropic (Claude) o Google (Gemini). */
import type { ContextoHerramientas } from "@/lib/asesor/herramientas";
import type { TurnoHistorial } from "@/lib/asesor/peticion";

export const PROVEEDORES = ["anthropic", "gemini"] as const;
export type NombreProveedor = (typeof PROVEEDORES)[number];

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

/** Herramienta definida una sola vez (JSON Schema); cada proveedor la traduce a su formato. */
export interface DefinicionHerramienta {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: readonly string[] };
}

/** Instrucciones del sistema en tres bloques: fijo, conocimiento tributario y variable (perfil, modo, contexto). */
export interface BloquesSistema {
  fijo: string;
  conocimiento: string;
  variable: string;
}

export type EventoAgente =
  | { t: "texto"; d: string }
  | { t: "herramienta"; id: string; nombre: string; estado: "pidiendo" | "listo" | "error" }
  /** La vuelta se repitió (entrada de herramienta mal formada): descartar el texto de esa vuelta. */
  | { t: "reintento" }
  | { t: "nota"; d: string }
  | { t: "fin"; stop: string | null };

export interface EntradaAgente {
  sistema: BloquesSistema;
  historial: TurnoHistorial[];
  pregunta: string;
  ctx: ContextoHerramientas;
  signal?: AbortSignal;
}

/** Error del proveedor traducido a un mensaje para el usuario, sin detalles técnicos. */
export interface ErrorIA {
  tipo: "clave" | "modelo" | "limite" | "peticion" | "servicio" | "conexion" | "otro";
  status: number;
  mensaje: string;
}

export interface ProveedorIA {
  nombre: NombreProveedor;
  /** Nombre para los avisos: "Google (Gemini)" o "Anthropic (Claude)". */
  etiqueta: string;
  modelo: string;
  correr(e: EntradaAgente): AsyncGenerator<EventoAgente>;
  /** Traduce un error del SDK; null si no es un error del proveedor. */
  traducirError(e: unknown): ErrorIA | null;
}

export const MENSAJE_SATURADO = "El asesor está muy solicitado, intenta en un minuto.";
export const MAX_VUELTAS = 8;
