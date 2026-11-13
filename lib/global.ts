/* Datos globales del día: TRM, Tesoro de EE. UU. a 10 años, SOFR y spread TES 10A − UST 10A.
   Funciones puras (el servidor trae los datos; aquí solo se arman y se comparan).
   El spread usa las dos tasas en la misma fecha (la de la curva TES cargada) y en la misma
   convención: el UST se publica semestral y se pasa a E.A. antes de restar. */
import { eaDesdeSemestral, type UST10 } from "@/lib/data/fuentes/tesoro";

export interface SpreadTesUst {
  /** TES de referencia (el más cercano a 10 años): nombre, TIR E.A. y plazo en años. */
  tes: { nombre: string; tir: number; plazo: number };
  /** UST 10A en la fecha de la curva TES: tasa publicada (semestral) y en E.A. */
  ust: { valor: number; ea: number; fecha: string };
  /** Fecha de la curva TES. */
  fecha: string;
  /** TES E.A. − UST E.A., en pb. */
  pb: number;
  /** true si el UST es de otro día que la curva (p. ej. festivo en EE. UU.). */
  desfase: boolean;
}

/** Spread TES 10A − UST 10A en pb, con las dos tasas en E.A. */
export function spreadTesUst(tes: { nombre: string; tir: number; plazo: number }, ust: UST10, fechaCurva: string): SpreadTesUst {
  const ea = eaDesdeSemestral(ust.valor);
  return { tes, ust: { valor: ust.valor, ea, fecha: ust.fecha }, fecha: fechaCurva, pb: (tes.tir - ea) * 1e4, desfase: ust.fecha !== fechaCurva };
}
