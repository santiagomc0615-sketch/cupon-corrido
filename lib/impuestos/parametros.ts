/* Parámetros tributarios de Colombia para la estimación del P&G. Cada valor guarda su norma, fecha
   y enlace oficial. Verificados el 17·nov·2026 en el normograma de la DIAN y en textos oficiales.
   Son editables en la interfaz (se guardan en el navegador) y se pueden restaurar a estos valores.
   Estimación académica: no constituye asesoría tributaria. */

export interface FuenteNorma {
  norma: string;
  fecha: string;
  enlace: string;
  nota?: string;
}

/** Tramo del art. 241 E.T. en UVT: sobre el exceso de `desde`, a la `tarifa`, más `fijo` UVT. */
export interface TramoRenta {
  desde: number;
  hasta: number | null;
  tarifa: number;
  fijo: number;
}

export interface ParametrosTributarios {
  /** Retención en la fuente sobre rendimientos de títulos de renta fija, CDT y TES. */
  retencion: number;
  /** Componente inflacionario no gravado de los rendimientos financieros (personas naturales no obligadas). */
  componenteInflacionario: number;
  /** Año gravable al que corresponde el componente inflacionario. */
  anioComponente: number;
  /** Valor de la UVT en pesos. */
  uvt: number;
  anioUvt: number;
  /** Tabla del art. 241 E.T. (personas naturales residentes). */
  tabla241: TramoRenta[];
  /** Tarifa de ganancia ocasional. */
  gananciaOcasional: number;
  /** Años mínimos de tenencia para que la utilidad en venta sea ganancia ocasional. */
  aniosGananciaOcasional: number;
  /** Tarifa general de renta de personas jurídicas. */
  rentaJuridica: number;
  /** Gravamen a los movimientos financieros. */
  gmf: number;
}

export const FECHA_VERIFICACION = "2026-11-17";

export const PARAMETROS_OFICIALES: ParametrosTributarios = {
  retencion: 0.04,
  componenteInflacionario: 0.5543,
  anioComponente: 2025,
  uvt: 52374,
  anioUvt: 2026,
  tabla241: [
    { desde: 0, hasta: 1090, tarifa: 0, fijo: 0 },
    { desde: 1090, hasta: 1700, tarifa: 0.19, fijo: 0 },
    { desde: 1700, hasta: 4100, tarifa: 0.28, fijo: 116 },
    { desde: 4100, hasta: 8670, tarifa: 0.33, fijo: 788 },
    { desde: 8670, hasta: 18970, tarifa: 0.35, fijo: 2296 },
    { desde: 18970, hasta: 31000, tarifa: 0.37, fijo: 5901 },
    { desde: 31000, hasta: null, tarifa: 0.39, fijo: 10352 },
  ],
  gananciaOcasional: 0.15,
  aniosGananciaOcasional: 2,
  rentaJuridica: 0.35,
  gmf: 0.004,
};

export const FUENTES: Record<keyof ParametrosTributarios, FuenteNorma | null> = {
  retencion: {
    norma: "Decreto 700 de 1997 modificado por el Decreto 2418 de 2013 (art. 3); DUR 1625 de 2016, arts. 1.2.4.2.32 y 1.2.4.2.83",
    fecha: "2013-10-31",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_19736_2014.htm",
    nota: "La DIAN (Oficio 19736 de 2014 y Oficio 905222 de 2021) confirma que la tarifa para títulos con intereses o descuento, incluidos los TES y los CDT, pasó del 7 % al 4 %. Las entidades vigiladas por la Superfinanciera no son sujetas a esta retención (autorretienen).",
  },
  componenteInflacionario: {
    norma: "Decreto 898 de 2026 (art. 40-1 E.T.)",
    fecha: "2026-07-29",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/decreto_0898_2026.htm",
    nota: "55,43 % de los rendimientos financieros del año gravable 2025 no constituye renta ni ganancia ocasional. Solo personas naturales y sucesiones ilíquidas no obligadas a llevar contabilidad.",
  },
  anioComponente: null,
  uvt: {
    norma: "Resolución DIAN 000238 de 2025",
    fecha: "2025-12-15",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0238_2025.htm",
    nota: "UVT para el año gravable 2026.",
  },
  anioUvt: null,
  tabla241: {
    norma: "Art. 241 del Estatuto Tributario (modificado por la Ley 2010 de 2019, art. 34)",
    fecha: "2019-12-27",
    enlace: "https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/estatuto_tributario_pr010.pdf",
    nota: "Se aplica a la renta líquida gravable de la cédula general (rentas de trabajo, de capital y no laborales).",
  },
  gananciaOcasional: {
    norma: "Arts. 313 y 314 E.T. (modificados por la Ley 2277 de 2022)",
    fecha: "2022-12-13",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/ley_2277_2022.htm",
    nota: "15 % para personas naturales y jurídicas.",
  },
  aniosGananciaOcasional: {
    norma: "Art. 300 E.T.; art. 33 E.T. (Oficio DIAN 1807 de 2018)",
    fecha: "2018-01-01",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_1807_2018.htm",
    nota: "Es ganancia ocasional la utilidad en la venta de bienes que fueron activo fijo por dos años o más (art. 300). Para títulos de renta fija la DIAN no lo ha confirmado: la utilidad se realiza al vender (precio − costo fiscal, art. 33) y en la venta de TIDIS la trata como rendimiento financiero. Por eso, por defecto, la utilidad en venta es renta ordinaria; puede marcar el título como activo fijo si su contador lo respalda.",
  },

  rentaJuridica: {
    norma: "Art. 240 E.T. (modificado por la Ley 2277 de 2022)",
    fecha: "2022-12-13",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/ley_2277_2022.htm",
    nota: "35 %. Las instituciones financieras con renta gravable de 120.000 UVT o más pagan 5 puntos adicionales entre 2023 y 2027.",
  },
  gmf: {
    norma: "Art. 872 E.T.",
    fecha: "2006-12-27",
    enlace: "https://normograma.dian.gov.co/dian/compilacion/docs/estatuto_tributario.htm",
    nota: "4 por mil sobre los retiros. Exenta una cuenta de ahorros por titular hasta 350 UVT al mes (art. 879 num. 1).",
  },
};

/** Une los parámetros guardados con los oficiales (los campos que falten toman el oficial). */
export function conOficiales(p: Partial<ParametrosTributarios> | null | undefined): ParametrosTributarios {
  return { ...PARAMETROS_OFICIALES, ...(p ?? {}), tabla241: p?.tabla241?.length ? p.tabla241 : PARAMETROS_OFICIALES.tabla241 };
}
