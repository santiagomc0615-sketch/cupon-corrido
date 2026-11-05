/* Indicadores derivados de las series de mercado que usan varias secciones
   (cinta, mercado, curva, portafolio, asesor). */
import { toN, type Motor, type TuplaTES } from "@/lib/engine";
import type { SnapshotMercado } from "@/lib/data/mercado";

export type Punto = [number, number, string?];

export function derivarMercado(motor: Motor, snap: SnapshotMercado) {
  const M = motor.mercado;
  const ibrLast = M.ibr[M.ibr.length - 1];
  const ipcV = M.ipcV;
  const ipcLast = ipcV[ipcV.length - 1];
  const ipcPrev = ipcV[ipcV.length - 2];
  const uvrHoy = motor.uvrAt(toN(snap.fechaAnalisis));
  const tesSorted: TuplaTES[] = M.tes.slice().sort((a, b) => a[4] - b[4]);
  const tes2 = tesSorted.find((r) => r[4] >= 1.8) || tesSorted[0];
  const tes10 = tesSorted.slice().reverse().find((r) => r[4] <= 10.5) || tesSorted[tesSorted.length - 1];
  const realRate = (1 + snap.macro.tpm) / (1 + ipcLast.annual) - 1;

  // Curva: spot cero cupón, TES de mercado y forwards a 1 año implícitos
  const zs: Punto[] = M.zero.map((r) => [r[0], r[1]]);
  const mk: Punto[] = tesSorted.map((r) => [r[4], r[3], r[0].replace("TES TF ", "")]);
  const fw: Punto[] = [];
  const tMax = Math.max(...zs.map((r) => r[0]));
  for (let t = 1; t <= tMax; t += 0.5) {
    const a = motor.spot(t - 1),
      b = motor.spot(t);
    fw.push([t, Math.pow(1 + b, t) / Math.pow(1 + a, t - 1) - 1]);
  }

  return {
    ibrLast,
    ipcV,
    ipcLast,
    ipcPrev,
    uvrHoy,
    tesSorted,
    tes2,
    tes10,
    realRate,
    curva: { zs, mk, fw },
    ultimaUVR: M.uvr[M.uvr.length - 1],
  };
}

export type MercadoDerivado = ReturnType<typeof derivarMercado>;
