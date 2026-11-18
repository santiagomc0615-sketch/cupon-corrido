/* Traducción de las herramientas del asesor (definidas una sola vez en lib/asesor/herramientas.ts,
   en JSON Schema) al formato de cada proveedor. La ejecución es la misma: ejecutarHerramienta. */
import type Anthropic from "@anthropic-ai/sdk";
import type { FunctionDeclaration } from "@google/genai";
import type { DefinicionHerramienta } from "./tipos";

/** Anthropic: tool con input_schema y streaming de la entrada. */
export const herramientasAnthropic = (defs: DefinicionHerramienta[]): Anthropic.Beta.BetaTool[] =>
  defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: { ...d.input_schema, required: [...(d.input_schema.required ?? [])] },
    eager_input_streaming: true,
  }));

/** Gemini: functionDeclarations con el mismo JSON Schema (parametersJsonSchema). */
export const herramientasGemini = (defs: DefinicionHerramienta[]): FunctionDeclaration[] =>
  defs.map((d) => ({
    name: d.name,
    description: d.description,
    parametersJsonSchema: { ...d.input_schema, required: [...(d.input_schema.required ?? [])] },
  }));
