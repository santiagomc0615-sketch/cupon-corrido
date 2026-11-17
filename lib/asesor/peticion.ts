/* Validación de la petición al asesor (función pura, se prueba sin red). */
import type { ConfigFondeo } from "@/lib/carry/config";
import type { DatosUVR } from "@/lib/analisis/inflacion-implicita";
import type { EntradasUI } from "@/lib/calculadora";
import type { ParametrosTributarios, TramoRenta } from "@/lib/impuestos/parametros";
import type { PerfilContribuyente } from "@/lib/impuestos/perfil";

export const PERFILES = ["conservador", "moderado", "agresivo"] as const;
export type Perfil = (typeof PERFILES)[number];
export const MODOS = ["chat", "comite", "informe"] as const;
export type Modo = (typeof MODOS)[number];

export interface TurnoHistorial {
  role: "user" | "assistant";
  content: string;
}

/** Consultas rápidas cuya respuesta no depende del portafolio y se puede guardar en caché. */
export const RAPIDAS_CACHEABLES = ["resumen"] as const;
export type RapidaCacheable = (typeof RAPIDAS_CACHEABLES)[number];

export interface PeticionAsesor {
  /** Consulta rápida cacheable, si la pregunta es una de ellas. */
  rapida?: RapidaCacheable;
  pregunta: string;
  /** Turnos anteriores (solo texto), los más recientes. */
  historial: TurnoHistorial[];
  /** Perfil de riesgo del cliente. */
  perfil: Perfil;
  /** chat normal, comité de inversión (a favor / en contra / conclusión) o informe para el cliente. */
  modo: Modo;
  /** Entradas del título abierto en la calculadora (el servidor lo valora con el motor). */
  titulo: EntradasUI | null;
  /** Posiciones del portafolio (entradas de la calculadora) y su fecha de valoración. */
  portafolio: { fecha: string | null; posiciones: EntradasUI[] };
  /** Fondeo configurado por el usuario. */
  fondeo: Partial<ConfigFondeo> | null;
  /** Perfil tributario y parámetros editados por el usuario (los que falten, los oficiales). */
  tributario: { perfil: Partial<PerfilContribuyente>; params: Partial<ParametrosTributarios> | null } | null;
  /** TIR de TES UVR que cargó el usuario para la inflación implícita (null si no hay o son de ejemplo). */
  uvr: DatosUVR | null;
}

/** TIR UVR del usuario: fecha válida, fuente corta y hasta 40 referencias con vencimiento y TIR real en rango. */
function uvrDe(x: unknown): DatosUVR | null {
  if (!x || typeof x !== "object") return null;
  const u = x as Record<string, unknown>;
  if (u.ejemplo === true || typeof u.fecha !== "string" || !FECHA.test(u.fecha) || !Array.isArray(u.refs)) return null;
  const refs = u.refs
    .slice(0, 40)
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.vencimiento === "string" && FECHA.test(r.vencimiento) && enRango(r.tirReal, [-0.05, 0.3]))
    .map((r) => ({ titulo: String(r.titulo ?? "TES UVR").slice(0, 60), vencimiento: r.vencimiento as string, tirReal: r.tirReal as number }));
  return refs.length ? { fecha: u.fecha, fuente: String(u.fuente ?? "").slice(0, 120), refs } : null;
}

const TIPOS_CONTRIBUYENTE = ["pn_no_obligada", "pn_obligada", "juridica"];
/** Rangos válidos de los parámetros tributarios editables. */
const RANGOS: Partial<Record<keyof ParametrosTributarios, [number, number]>> = {
  retencion: [0, 0.2],
  componenteInflacionario: [0, 1],
  anioComponente: [2000, 2100],
  uvt: [10_000, 500_000],
  anioUvt: [2000, 2100],
  gananciaOcasional: [0, 0.5],
  aniosGananciaOcasional: [0, 10],
  rentaJuridica: [0, 0.6],
  gmf: [0, 0.02],
};
const enRango = (v: unknown, [a, b]: [number, number]) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;

/** Perfil y parámetros tributarios: solo campos conocidos y en rango. */
function tributarioDe(x: unknown): PeticionAsesor["tributario"] {
  if (!x || typeof x !== "object") return null;
  const t = x as Record<string, unknown>;
  const pr = (t.perfil && typeof t.perfil === "object" ? t.perfil : {}) as Record<string, unknown>;
  const perfil: Partial<PerfilContribuyente> = {};
  if (TIPOS_CONTRIBUYENTE.includes(pr.tipo as string)) perfil.tipo = pr.tipo as PerfilContribuyente["tipo"];
  if (pr.ingresosAnuales === null) perfil.ingresosAnuales = null;
  else if (enRango(pr.ingresosAnuales, [0, 1e13])) perfil.ingresosAnuales = pr.ingresosAnuales as number;
  if (enRango(pr.tarifaManual, [0, 0.6])) perfil.tarifaManual = pr.tarifaManual as number;
  if (typeof pr.gmf === "boolean") perfil.gmf = pr.gmf;
  if (typeof pr.gananciaOcasionalTitulos === "boolean") perfil.gananciaOcasionalTitulos = pr.gananciaOcasionalTitulos;
  let params: Partial<ParametrosTributarios> | null = null;
  if (t.params && typeof t.params === "object") {
    const pa = t.params as Record<string, unknown>;
    params = {};
    for (const [k, r] of Object.entries(RANGOS) as [keyof ParametrosTributarios, [number, number]][])
      if (enRango(pa[k], r)) (params as Record<string, number>)[k] = pa[k] as number;
    if (Array.isArray(pa.tabla241) && pa.tabla241.length >= 2 && pa.tabla241.length <= 12) {
      const tabla = pa.tabla241.map((f) => f as Record<string, unknown>);
      const ok = tabla.every((f) => enRango(f.desde, [0, 1e6]) && (f.hasta === null || enRango(f.hasta, [0, 1e6])) && enRango(f.tarifa, [0, 0.6]) && enRango(f.fijo, [0, 1e6]));
      if (ok) params.tabla241 = tabla.map((f) => ({ desde: f.desde, hasta: f.hasta, tarifa: f.tarifa, fijo: f.fijo }) as TramoRenta);
    }
  }
  return { perfil, params };
}

export const LIMITES = {
  pregunta: 2000,
  turnos: 6,
  turno: 6000,
  posiciones: 30,
  entradas: 4_000,
  fondeo: 2_000,
};

const TIPOS = ["TF", "IBR", "IPC", "UVR"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Entradas de un título: objeto plano de textos y números, con tipo válido y tamaño acotado. */
function entradas(x: unknown): EntradasUI | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  if (!TIPOS.includes(r.tipo as string)) return null;
  if (JSON.stringify(r).length > LIMITES.entradas) return null;
  const limpio: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "string") limpio[k] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) limpio[k] = v;
  }
  return { nombre: "", ...limpio } as EntradasUI;
}

export function validarPeticion(cuerpo: unknown): { ok: true; p: PeticionAsesor } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== "object") return { ok: false, error: "Petición inválida." };
  const c = cuerpo as Record<string, unknown>;
  const pregunta = typeof c.pregunta === "string" ? c.pregunta.trim() : "";
  if (!pregunta) return { ok: false, error: "Escribe una pregunta." };
  if (pregunta.length > LIMITES.pregunta) return { ok: false, error: `La pregunta es muy larga (máximo ${LIMITES.pregunta} caracteres).` };

  const crudo = Array.isArray(c.historial) ? c.historial : [];
  const historial: TurnoHistorial[] = [];
  for (const t of crudo.slice(-LIMITES.turnos)) {
    const r = t as Record<string, unknown>;
    if ((r.role !== "user" && r.role !== "assistant") || typeof r.content !== "string" || !r.content.trim()) continue;
    historial.push({ role: r.role, content: r.content.slice(0, LIMITES.turno) });
  }
  // La conversación debe empezar con el usuario y alternar roles.
  while (historial.length && historial[0].role !== "user") historial.shift();
  const alternado = historial.filter((t, i) => i === 0 || t.role !== historial[i - 1].role);
  if (alternado.length && alternado[alternado.length - 1].role === "user") alternado.pop();

  const perfil = PERFILES.find((x) => x === c.perfil) ?? "moderado";
  const modo = MODOS.find((x) => x === c.modo) ?? "chat";
  const titulo = entradas(c.titulo);

  const pfCrudo = (c.portafolio && typeof c.portafolio === "object" ? c.portafolio : {}) as Record<string, unknown>;
  const lista = Array.isArray(pfCrudo.posiciones) ? pfCrudo.posiciones : [];
  if (lista.length > LIMITES.posiciones) return { ok: false, error: `El portafolio tiene demasiadas posiciones (máximo ${LIMITES.posiciones}).` };
  const posiciones = lista.map(entradas).filter((x): x is EntradasUI => x != null);
  const fecha = typeof pfCrudo.fecha === "string" && FECHA.test(pfCrudo.fecha) ? pfCrudo.fecha : null;

  let fondeo: Partial<ConfigFondeo> | null = null;
  if (c.fondeo && typeof c.fondeo === "object" && !Array.isArray(c.fondeo)) {
    if (JSON.stringify(c.fondeo).length > LIMITES.fondeo) return { ok: false, error: "La configuración de fondeo es demasiado grande." };
    fondeo = c.fondeo as Partial<ConfigFondeo>;
  }

  const rapida = RAPIDAS_CACHEABLES.find((r) => r === c.rapida);
  return {
    ok: true,
    p: { pregunta, historial: alternado, perfil, modo, titulo, portafolio: { fecha, posiciones }, fondeo, tributario: tributarioDe(c.tributario), uvr: uvrDe(c.uvr), ...(rapida ? { rapida } : {}) },
  };
}
