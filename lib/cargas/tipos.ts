/* Series que se cargan desde archivos (no tienen API oficial). Compartido entre cliente y servidor. */
import type { CurvaFRACDatos, TuplaFecha } from "@/lib/engine";

export type TipoSerieCargada = "exp" | "ipc" | "ibr12";

/** Curvas armadas desde referencias TES: tasa fija (nominal) y UVR (real). */
export type TipoCurvaTES = "tes" | "tesuvr";

export const NOMBRE_SERIE: Record<TipoSerieCargada | "frac" | TipoCurvaTES, string> = {
  frac: "Curva FRAC (IBR forward)",
  exp: "Expectativas de inflación",
  ipc: "Índice IPC (DANE)",
  ibr12: "IBR a 12 meses",
  tes: "Referencias TES tasa fija (curva de rendimientos)",
  tesuvr: "Referencias TES UVR (curva real)",
};

/** Serie de fecha y valor. exp e ibr12 en fracción; ipc en índice (base dic-2018 = 100). */
export interface CargaSerie {
  tipo: TipoSerieCargada;
  origen: string;
  cargada: string;
  datos: TuplaFecha[];
}

/** Referencias TES para la curva: [título, vencimiento ISO, cupón, TIR] (fracciones; reales en UVR). */
export type RefTES = [string, string, number, number];

export interface CargaTES {
  tipo: TipoCurvaTES;
  origen: string;
  cargada: string;
  /** Fecha de la curva (TIR de cierre). */
  fecha: string;
  refs: RefTES[];
}

export interface CargaFRAC extends CurvaFRACDatos {
  tipo: "frac";
  datos: TuplaFecha[];
}

export type Carga = CargaSerie | CargaTES | CargaFRAC;

export interface MetaCarga {
  origen: string;
  cargada: string;
  filas: number;
  desde: string;
  hasta: string;
}

/** Índice de todo lo cargado (sin los datos de las curvas FRAC, que se descargan aparte). */
export interface IndiceCargas {
  frac: CurvaFRACDatos[];
  series: Partial<Record<TipoSerieCargada, MetaCarga>>;
  tes?: MetaCarga & { fecha: string };
  tesuvr?: MetaCarga & { fecha: string };
}

export const INDICE_VACIO: IndiceCargas = { frac: [], series: {} };

/** Cargas completas que necesita el servidor para armar los datos de mercado. */
export interface CargasServidor {
  indice: IndiceCargas;
  series: Partial<Record<TipoSerieCargada, CargaSerie>>;
  tes?: CargaTES;
  tesuvr?: CargaTES;
}

/** Lo que se puede eliminar en /datos. */
export type TipoEliminable = "frac" | TipoCurvaTES | TipoSerieCargada;
