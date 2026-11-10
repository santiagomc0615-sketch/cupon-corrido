/* Punto único de entrada de los datos de mercado para la interfaz (solo servidor).
   - En vivo: BanRep SDMX (TPM, IBR ON–6M, UVR), datos.gov.co (TRM) y DANE (IPC, anexo de índices).
     Si el DANE no responde se usa su última lectura guardada (lib/data/actualizar.ts la escribe).
   - Cargado: series que sube el administrador en /datos (FRAC, IPC, expectativas, IBR 12M, TES).
   - Respaldo: data/datos-mercado.json (última carga del Excel del curso), serie por serie.
   Se guarda en caché un día (cacheTag "mercado"); el cron diario y cada carga lo invalidan. */
import { cacheLife, cacheTag } from "next/cache";
import respaldo from "@/data/datos-mercado.json";
import type { DatosMercado } from "@/lib/engine";
import { INDICE_VACIO, type CargasServidor, type IndiceCargas } from "@/lib/cargas/tipos";
import { leerCargas, leerIpcDane } from "./almacen";
import { combinar, type ClaveFuente, type DatosEnVivo, type InfoFuente, type IpcEnVivo } from "./combinar";
import { ibrBanRep, tpmBanRep, uvrBanRep } from "./fuentes/banrep";
import { enVentanaDane, ipcDane, mesEsperado } from "./fuentes/dane";
import { trmDatosGov, type TRM } from "./fuentes/datosgov";
import { MACRO, type Macro } from "./macro";

/** Todo el conjunto de datos de mercado. */
export const TAG_MERCADO = "mercado";
/** Solo las fuentes en vivo (lo invalida el cron diario). */
export const TAG_VIVO = "mercado-vivo";
/** Solo las cargas del administrador (lo invalida cada carga). */
export const TAG_CARGAS = "cargas";

export interface SnapshotMercado {
  datos: DatosMercado;
  macro: Macro;
  /** Fecha de análisis por defecto (valoración de la calculadora y del portafolio). */
  fechaAnalisis: string;
  /** Algo vino en vivo o todo es respaldo. */
  origen: "respaldo" | "en-vivo";
  fuentes: Partial<Record<ClaveFuente, InfoFuente>>;
  trm?: TRM;
  /** Lo que está cargado en /datos. */
  cargas: IndiceCargas;
  /** Fecha y hora (Bogotá) en que se armó este conjunto de datos. */
  actualizado: string;
}

/** Fecha de corte de la carga del Excel usada por el prototipo. */
export const FECHA_EXCEL = "2026-11-04";

export const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export const ahoraBogota = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "America/Bogota", hour12: false }).slice(0, 16);

/** Mensaje de error legible, con la causa de red si la hay (p. ej. "fetch failed (ENOTFOUND)"). */
const motivo = (r: PromiseSettledResult<unknown>) => {
  if (r.status !== "rejected") return undefined;
  const e = r.reason as Error & { cause?: { code?: string; message?: string } };
  if (!(e instanceof Error)) return String(e);
  const causa = e.cause?.code ?? e.cause?.message;
  return causa ? `${e.message} (${causa})` : e.message;
};

/** Fuentes en vivo. Si alguna falla, o si es temporada de publicación del IPC y el DANE aún no
    trae el mes esperado, se guarda solo una hora para reintentar pronto. */
async function datosEnVivo(): Promise<{ vivo: DatosEnVivo; trm?: TRM; pendienteDane: boolean }> {
  "use cache";
  cacheTag(TAG_VIVO);
  const hoy = hoyBogota();
  const [tpm, ibr, uvr, trm, ipc] = await Promise.allSettled([
    tpmBanRep("2023-01-01"),
    ibrBanRep("2023-01-01"),
    uvrBanRep("2025-01-01"),
    trmDatosGov(),
    ipcDane(hoy),
  ]);
  let ipcVivo: IpcEnVivo | undefined;
  if (ipc.status === "fulfilled") {
    ipcVivo = { serie: ipc.value.serie, publicado: ipc.value.publicado, consultado: ahoraBogota() };
  } else {
    const g = await leerIpcDane().catch(() => null);
    if (g?.serie.length) ipcVivo = { serie: g.serie, publicado: g.publicado, consultado: g.consultado, guardado: true };
  }
  const vivo: DatosEnVivo = {
    tpm: tpm.status === "fulfilled" ? tpm.value : undefined,
    ibr: ibr.status === "fulfilled" ? ibr.value : undefined,
    uvr: uvr.status === "fulfilled" ? uvr.value : undefined,
    ipc: ipcVivo,
    errores: { tpm: motivo(tpm), ibr: motivo(ibr), uvr: motivo(uvr), trm: motivo(trm), ipc: motivo(ipc) },
  };
  const ultimoIpc = ipcVivo?.serie[ipcVivo.serie.length - 1]?.[0].slice(0, 7) ?? "";
  const pendienteDane = enVentanaDane(hoy) && ultimoIpc < mesEsperado(hoy);
  if (Object.values(vivo.errores).some(Boolean) || pendienteDane) {
    if (Object.values(vivo.errores).some(Boolean)) console.warn("[mercado] Fuentes en vivo con errores:", vivo.errores);
    cacheLife("hours");
  } else cacheLife("days");
  return { vivo, trm: trm.status === "fulfilled" ? trm.value : undefined, pendienteDane };
}

/** Series cargadas por el administrador. */
async function cargasGuardadas(): Promise<CargasServidor> {
  "use cache";
  cacheLife("max");
  cacheTag(TAG_CARGAS);
  try {
    return await leerCargas();
  } catch (e) {
    console.warn("[mercado] No se pudieron leer las cargas:", e);
    return { indice: INDICE_VACIO, series: {} };
  }
}

export async function obtenerMercado(): Promise<SnapshotMercado> {
  "use cache";
  cacheTag(TAG_MERCADO, TAG_VIVO, TAG_CARGAS);

  const base = respaldo as unknown as DatosMercado;
  const [{ vivo, trm, pendienteDane }, c] = await Promise.all([datosEnVivo(), cargasGuardadas()]);
  // Con alguna fuente caída, o esperando el IPC del mes en los días de publicación del DANE,
  // se reintenta en una hora; si todo respondió, un día.
  if (Object.values(vivo.errores).some(Boolean) || pendienteDane) cacheLife("hours");
  else cacheLife("days");
  const { datos, fuentes } = combinar(base, vivo, c);

  const macro: Macro = { ...MACRO };
  const ultTpm = vivo.tpm?.[vivo.tpm.length - 1];
  if (ultTpm) {
    macro.tpm = ultTpm[1] / 100;
    macro.tpmFecha = ultTpm[0];
    macro.tpmFuente = "BanRep · SDMX";
    fuentes.tpm = { fuente: "BanRep · SDMX", estado: "en-vivo", hasta: ultTpm[0] };
  } else {
    fuentes.tpm = { fuente: MACRO.tpmFuente, estado: "respaldo", hasta: MACRO.tpmFecha, detalle: vivo.errores.tpm };
  }
  if (trm) fuentes.trm = { fuente: "datos.gov.co · Superfinanciera", estado: "en-vivo", hasta: trm.fecha };

  const enVivo = Object.values(fuentes).some((f) => f?.estado === "en-vivo");

  return {
    datos,
    macro,
    fechaAnalisis: enVivo ? hoyBogota() : FECHA_EXCEL,
    origen: enVivo ? "en-vivo" : "respaldo",
    fuentes,
    trm,
    cargas: c.indice,
    actualizado: ahoraBogota(),
  };
}
