/* Punto único de entrada de los datos de mercado para la interfaz (solo servidor).
   - En vivo: BanRep SDMX (TPM, IBR ON–6M, UVR), datos.gov.co (TRM), DANE (IPC, anexo de índices) y
     Fed de Nueva York (SOFR, para el fondeo en dólares) y Tesoro de EE. UU. (rendimiento a 10 años).
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
import { dtfBanRep, ibrBanRep, tpmBanRep, uvrBanRep } from "./fuentes/banrep";
import { enVentanaDane, ipcDane, mesEsperado } from "./fuentes/dane";
import { trmDatosGov, type TRM } from "./fuentes/datosgov";
import { sofrNYFed, type SOFR } from "./fuentes/nyfed";
import { ust10EnFecha, type UST10 } from "./fuentes/tesoro";
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
  /** SOFR en vivo (Fed de Nueva York), para el fondeo en dólares. */
  sofr?: SOFR;
  /** DTF E.A. (BanRep): referencia de la tasa de un CDT a 90 días. */
  dtf?: { valor: number; fecha: string };
  /** Tesoro de EE. UU. a 10 años: último cierre y el cierre en la fecha de la curva TES (para el spread). */
  ust10?: UST10;
  ust10Curva?: UST10;
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
async function datosEnVivo(): Promise<{
  vivo: DatosEnVivo;
  trm?: TRM;
  sofr?: SOFR;
  dtf?: { valor: number; fecha: string };
  ust10?: UST10;
  pendienteDane: boolean;
}> {
  "use cache";
  cacheTag(TAG_VIVO);
  const hoy = hoyBogota();
  const [tpm, ibr, uvr, trm, ipc, sofr, dtf, ust10] = await Promise.allSettled([
    tpmBanRep("2023-01-01"),
    ibrBanRep("2023-01-01"),
    uvrBanRep("2025-01-01"),
    trmDatosGov(),
    ipcDane(hoy),
    sofrNYFed(),
    dtfBanRep(hoy),
    ust10EnFecha(hoy),
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
    errores: { tpm: motivo(tpm), ibr: motivo(ibr), uvr: motivo(uvr), trm: motivo(trm), ipc: motivo(ipc), sofr: motivo(sofr), dtf: motivo(dtf), ust10: motivo(ust10) },
  };
  const ultimoIpc = ipcVivo?.serie[ipcVivo.serie.length - 1]?.[0].slice(0, 7) ?? "";
  const pendienteDane = enVentanaDane(hoy) && ultimoIpc < mesEsperado(hoy);
  if (Object.values(vivo.errores).some(Boolean) || pendienteDane) {
    if (Object.values(vivo.errores).some(Boolean)) console.warn("[mercado] Fuentes en vivo con errores:", vivo.errores);
    cacheLife("hours");
  } else cacheLife("days");
  return {
    vivo,
    trm: trm.status === "fulfilled" ? trm.value : undefined,
    sofr: sofr.status === "fulfilled" ? sofr.value : undefined,
    dtf: dtf.status === "fulfilled" ? dtf.value : undefined,
    ust10: ust10.status === "fulfilled" ? ust10.value : undefined,
    pendienteDane,
  };
}

/** UST 10 años en una fecha pasada (la de la curva TES): no cambia, se guarda hasta la próxima actualización. */
async function ust10Guardado(fecha: string): Promise<UST10> {
  "use cache";
  cacheTag(TAG_VIVO);
  cacheLife("days");
  return ust10EnFecha(fecha);
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
  const [{ vivo, trm, sofr, dtf, ust10, pendienteDane }, c] = await Promise.all([datosEnVivo(), cargasGuardadas()]);
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
  fuentes.sofr = sofr
    ? { fuente: "Fed de Nueva York", estado: "en-vivo", hasta: sofr.fecha }
    : { fuente: "Fed de Nueva York", estado: "respaldo", hasta: "", detalle: (vivo.errores.sofr ?? "sin dato") + " · ingrésela a mano en el fondeo" };
  // UST 10A en la fecha de la curva TES, para que el spread compare tasas del mismo día.
  const ust10Curva = await ust10Guardado(datos.curveDate).catch(() => undefined);
  fuentes.ust10 = ust10
    ? { fuente: "Tesoro de EE. UU.", estado: "en-vivo", hasta: ust10.fecha }
    : { fuente: "Tesoro de EE. UU.", estado: "respaldo", hasta: "", detalle: vivo.errores.ust10 ?? "sin dato" };
  fuentes.dtf = dtf
    ? { fuente: "BanRep · SDMX", estado: "en-vivo", hasta: dtf.fecha }
    : { fuente: "BanRep · SDMX", estado: "respaldo", hasta: "", detalle: (vivo.errores.dtf ?? "sin dato") + " · la tasa del CDT se ingresa a mano" };

  const enVivo = Object.values(fuentes).some((f) => f?.estado === "en-vivo");

  return {
    datos,
    macro,
    fechaAnalisis: enVivo ? hoyBogota() : FECHA_EXCEL,
    origen: enVivo ? "en-vivo" : "respaldo",
    fuentes,
    trm,
    sofr,
    dtf,
    ust10,
    ust10Curva,
    cargas: c.indice,
    actualizado: ahoraBogota(),
  };
}
