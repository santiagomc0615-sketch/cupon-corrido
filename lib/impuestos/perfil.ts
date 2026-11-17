/* Perfil del contribuyente y tarifas. Funciones puras. */
import type { ParametrosTributarios, TramoRenta } from "./parametros";

export type TipoContribuyente = "pn_no_obligada" | "pn_obligada" | "juridica";

export const NOMBRE_CONTRIBUYENTE: Record<TipoContribuyente, string> = {
  pn_no_obligada: "Persona natural no obligada a llevar contabilidad",
  pn_obligada: "Persona natural obligada a llevar contabilidad",
  juridica: "Persona jurídica",
};

export interface PerfilContribuyente {
  tipo: TipoContribuyente;
  /** Ingresos anuales aproximados de la cédula general (pesos), para la tarifa marginal del art. 241. */
  ingresosAnuales: number | null;
  /** Tarifa marginal que se usa si no se dan ingresos (persona natural). */
  tarifaManual: number;
  /** Incluir el GMF sobre el dinero que se retira. */
  gmf: boolean;
  /** Tratar la utilidad en venta como ganancia ocasional si el título fue activo fijo 2 años o más
      (art. 300 E.T.). Por defecto no: la DIAN no lo ha confirmado para renta fija y trata la utilidad
      en la venta de títulos como rendimiento financiero. */
  gananciaOcasionalTitulos?: boolean;
}

export const PERFIL_INICIAL: PerfilContribuyente = { tipo: "pn_no_obligada", ingresosAnuales: null, tarifaManual: 0.19, gmf: false, gananciaOcasionalTitulos: false };

export const esNatural = (t: TipoContribuyente) => t !== "juridica";

/** Impuesto del art. 241 en UVT para una base en UVT. */
export function impuesto241(baseUVT: number, tabla: TramoRenta[]): number {
  if (baseUVT <= 0) return 0;
  const t = [...tabla].reverse().find((x) => baseUVT > x.desde) ?? tabla[0];
  return (baseUVT - t.desde) * t.tarifa + t.fijo;
}

/** Tarifa marginal del art. 241 para unos ingresos en pesos. */
export function tarifaMarginal(ingresos: number, p: Pick<ParametrosTributarios, "uvt" | "tabla241">): number {
  const u = ingresos / p.uvt;
  const t = [...p.tabla241].reverse().find((x) => u > x.desde) ?? p.tabla241[0];
  return t.tarifa;
}

export interface ImpuestoOrdinario {
  impuesto: number;
  /** Impuesto / base. */
  tarifaEfectiva: number;
  metodo: string;
}

/** Impuesto de renta ordinaria sobre una base (pesos) según el perfil. Persona natural con ingresos:
    impuesto incremental = tabla(ingresos + base) − tabla(ingresos). Sin ingresos: base × tarifa manual. */
export function impuestoRentaOrdinaria(base: number, perfil: PerfilContribuyente, p: ParametrosTributarios): ImpuestoOrdinario {
  if (base <= 0) return { impuesto: 0, tarifaEfectiva: 0, metodo: "Sin base gravable" };
  if (perfil.tipo === "juridica") return { impuesto: base * p.rentaJuridica, tarifaEfectiva: p.rentaJuridica, metodo: "Tarifa general de personas jurídicas (art. 240 E.T.)" };
  if (perfil.ingresosAnuales != null && perfil.ingresosAnuales >= 0) {
    const i0 = impuesto241(perfil.ingresosAnuales / p.uvt, p.tabla241);
    const i1 = impuesto241((perfil.ingresosAnuales + base) / p.uvt, p.tabla241);
    const impuesto = (i1 - i0) * p.uvt;
    return { impuesto, tarifaEfectiva: impuesto / base, metodo: "Tabla del art. 241 sobre sus ingresos más este rendimiento" };
  }
  return { impuesto: base * perfil.tarifaManual, tarifaEfectiva: perfil.tarifaManual, metodo: "Tarifa marginal ingresada" };
}
