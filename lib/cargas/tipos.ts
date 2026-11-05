/* Series que se cargan desde archivos (no tienen API oficial). Compartido entre cliente y servidor. */
import type { CurvaFRACDatos, TuplaFecha } from "@/lib/engine";

export type TipoSerieCargada = "exp" | "ipc" | "ibr12";

export const NOMBRE_SERIE: Record<TipoSerieCargada | "frac" | "tes", string> = {
  frac: "Curva FRAC (IBR forward)",
  exp: "Expectativas de inflación",
  ipc: "Índice IPC (DANE)",
  ibr12: "IBR a 12 meses",
  tes: "Referencias TES (curva de rendimientos)",
};

/** Serie de fecha y valor. exp e ibr12 en fracción; ipc en índice (base dic-2018 = 100). */
export interface CargaSerie {
  tipo: TipoSerieCargada;
  origen: string;
  cargada: string;
  datos: TuplaFecha[];
}

/** Referencias TES para la curva: [título, vencimiento ISO, cupón, TIR] (fracciones). */
export type RefTES = [string, string, number, number];

export interface CargaTES {
  tipo: "tes";
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
}

export const INDICE_VACIO: IndiceCargas = { frac: [], series: {} };

/** Cargas completas que necesita el servidor para armar los datos de mercado. */
export interface CargasServidor {
  indice: IndiceCargas;
  series: Partial<Record<TipoSerieCargada, CargaSerie>>;
  tes?: CargaTES;
}
