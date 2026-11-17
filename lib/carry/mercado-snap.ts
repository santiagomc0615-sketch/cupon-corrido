/* Datos de mercado del fondeo (MercadoFondeo) a partir del conjunto del día (servidor y pruebas). */
import type { SnapshotMercado } from "@/lib/data/mercado";
import type { MercadoFondeo } from "./config";

export function mercadoFondeo(snap: SnapshotMercado): MercadoFondeo {
  const u = snap.datos.ibr[snap.datos.ibr.length - 1];
  return {
    sofr: snap.sofr?.valor ?? null,
    sofrFecha: snap.sofr?.fecha,
    spot: snap.trm?.valor ?? null,
    spotFecha: snap.trm?.fecha,
    spot12m: snap.trm?.hace12m ?? null,
    tpm: snap.macro.tpm,
    tpmFecha: snap.macro.tpmFecha,
    ibr: u ? { fecha: u[0], on: u[1] / 100, m1: u[2] / 100, m3: u[3] / 100, m6: u[4] / 100 } : null,
  };
}
