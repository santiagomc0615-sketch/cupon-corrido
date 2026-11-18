/* Asesor como agente con herramientas.
   - Las instrucciones viven en lib/ia/instrucciones.ts y los proveedores (Anthropic, Gemini) en lib/ia/.
   - armarContexto: valora con el motor el portafolio y el título que manda el navegador. */
import { CONFIG_INICIAL, type ConfigFondeo } from "@/lib/carry/config";
import { toEngine, type EntradasUI } from "@/lib/calculadora";
import type { SnapshotMercado } from "@/lib/data/mercado";
import { crearMotor, esError, type Motor } from "@/lib/engine";
import { conOficiales } from "@/lib/impuestos/parametros";
import { PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import type { ContextoHerramientas, PosicionAgente } from "./herramientas";
import type { PeticionAsesor } from "./peticion";

export { SISTEMA_AGENTE, sistemaVariable } from "@/lib/ia/instrucciones";
export { correrAgente, type OpcionesAgente } from "@/lib/ia/anthropic";
export { MAX_VUELTAS, type EventoAgente } from "@/lib/ia/tipos";

/* ---------- contexto ---------- */
function valorarEntradas(motor: Motor, e: EntradasUI, fecha: string): PosicionAgente | null {
  const b = toEngine({ ...e, valoracion: fecha });
  const o = motor.price(b);
  return esError(o) ? null : { titulo: String(e.nombre || `${e.tipo} ${e.vencimiento}`), b, o };
}

/** Arma el contexto de las herramientas con el motor del día y lo que mandó el navegador. */
export function armarContexto(snap: SnapshotMercado, p: Pick<PeticionAsesor, "titulo" | "portafolio" | "fondeo"> & Partial<Pick<PeticionAsesor, "tributario" | "uvr">>) {
  const motor = crearMotor(snap.datos);
  const fecha = snap.fechaAnalisis;
  const fechaPf = p.portafolio.fecha ?? fecha;
  const valoradas = p.portafolio.posiciones.map((e) => valorarEntradas(motor, e, fechaPf));
  const portafolio = valoradas.filter((x): x is PosicionAgente => x != null);
  const titulo = p.titulo ? valorarEntradas(motor, p.titulo, String(p.titulo.valoracion || fecha)) : null;
  const f = p.fondeo;
  const fondeo: ConfigFondeo | null = f ? { ...CONFIG_INICIAL, ...f, exterior: { ...CONFIG_INICIAL.exterior, ...(f.exterior ?? {}) } } : null;
  const tributario = { perfil: { ...PERFIL_INICIAL, ...(p.tributario?.perfil ?? {}) }, params: conOficiales(p.tributario?.params) };
  const ctx: ContextoHerramientas = { motor, snap, fecha, portafolio, titulo, fondeo, tributario, uvr: p.uvr ?? null };
  return { ctx, invalidas: valoradas.length - portafolio.length };
}
