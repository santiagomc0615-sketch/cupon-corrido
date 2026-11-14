/* Actualización de los datos de mercado: la usan el Vercel Cron (dos veces al día) y la ruta
   protegida /api/actualizar. Lee el IPC del DANE y las series del BanRep (TPM, IBR, UVR, DTF), guarda la
   última lectura buena de cada una (si el BanRep o el DANE fallan después, se usa esa) y vence la caché
   de las fuentes en vivo para que la próxima visita traiga todo nuevo. Solo servidor. */
import "server-only";
import { revalidateTag } from "next/cache";
import { guardarBanRep, guardarIpcDane, leerIpcDane, type BanRepGuardado } from "./almacen";
import { dtfBanRep, ibrBanRep, tpmBanRep, uvrBanRep } from "./fuentes/banrep";
import { enVentanaDane, ipcDane, mesEsperado, type IpcDane } from "./fuentes/dane";
import { ahoraBogota, hoyBogota, TAG_VIVO } from "./mercado";

export interface ResultadoActualizacion {
  ok: boolean;
  hora: string;
  /** Por serie del BanRep: "guardada" o el error. */
  banrep: Record<"tpm" | "ibr" | "uvr" | "dtf", string>;
  ipc: {
    /** Último mes que trae el DANE (AAAA-MM). */
    ultimoMes: string | null;
    /** Mes que debería estar publicado (el anterior a hoy). */
    esperado: string;
    /** Inflación anual del último mes, en %. */
    inflacionAnual: number | null;
    publicado: string | null;
    /** El último mes cambió respecto a la lectura guardada anterior. */
    nuevo: boolean;
    intentos: number;
    error?: string;
  };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ultimoMes = (d: { serie: [string, ...unknown[]][] } | null | undefined) => d?.serie[d.serie.length - 1]?.[0].slice(0, 7) ?? null;

/** Inflación anual del último mes de la serie (índice / índice 12 meses antes − 1). */
function inflacion(d: IpcDane): number | null {
  const s = d.serie;
  const u = s[s.length - 1];
  const hace12 = s.find((r) => r[0].slice(0, 7) === `${+u[0].slice(0, 4) - 1}${u[0].slice(4, 7)}`);
  return hace12 ? +((u[1] / hace12[1] - 1) * 100).toFixed(2) : null;
}

/**
 * @param reintentos En los días de publicación del DANE, cuántas veces volver a consultar si el mes
 *   esperado aún no aparece (con `pausaMs` entre intentos).
 */
export async function actualizarDatos({ reintentos = 0, pausaMs = 15_000 } = {}): Promise<ResultadoActualizacion> {
  const hoy = hoyBogota();
  const esperado = mesEsperado(hoy);
  const previo = await leerIpcDane().catch(() => null);
  const max = enVentanaDane(hoy) ? 1 + reintentos : 1;

  let d: IpcDane | null = null;
  let error: string | undefined;
  let intentos = 0;
  for (; intentos < max; ) {
    intentos++;
    try {
      d = await ipcDane(hoy);
      error = undefined;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (d && (ultimoMes(d) ?? "") >= esperado) break;
    if (intentos < max) await esperar(pausaMs);
  }

  if (d) {
    try {
      await guardarIpcDane({ ...d, consultado: ahoraBogota() });
    } catch (e) {
      console.warn("[actualizar] No se pudo guardar la lectura del DANE:", e);
    }
  }
  // BanRep: se guarda cada serie que llegue bien; las que fallen conservan su lectura anterior.
  const consultado = ahoraBogota();
  const [tpm, ibr, uvr, dtf] = await Promise.allSettled([tpmBanRep("2023-01-01"), ibrBanRep("2023-01-01"), uvrBanRep("2025-01-01"), dtfBanRep(hoy)]);
  const nuevo: BanRepGuardado = {};
  if (tpm.status === "fulfilled" && tpm.value.length) nuevo.tpm = { serie: tpm.value, consultado };
  if (ibr.status === "fulfilled" && ibr.value.length) nuevo.ibr = { serie: ibr.value, consultado };
  if (uvr.status === "fulfilled" && uvr.value.length) nuevo.uvr = { serie: uvr.value, consultado };
  if (dtf.status === "fulfilled") nuevo.dtf = { ...dtf.value, consultado };
  try {
    await guardarBanRep(nuevo);
  } catch (e) {
    console.warn("[actualizar] No se pudo guardar la lectura del BanRep:", e);
  }
  const estado = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? "guardada" : r.reason instanceof Error ? r.reason.message : String(r.reason));

  // Vence ya (no "stale-while-revalidate"): la siguiente visita arma los datos de nuevo.
  revalidateTag(TAG_VIVO, { expire: 0 });

  const res: ResultadoActualizacion = {
    ok: Boolean(d),
    hora: ahoraBogota(),
    banrep: { tpm: estado(tpm), ibr: estado(ibr), uvr: estado(uvr), dtf: estado(dtf) },
    ipc: {
      ultimoMes: ultimoMes(d),
      esperado,
      inflacionAnual: d ? inflacion(d) : null,
      publicado: d?.publicado ?? null,
      nuevo: Boolean(d) && ultimoMes(d) !== ultimoMes(previo),
      intentos,
      ...(error ? { error } : {}),
    },
  };
  console.info("[actualizar]", JSON.stringify(res));
  return res;
}
