/* Herramientas tributarias del asesor: calcular_impuestos y calcular_pyg. Calculan con lib/impuestos
   y lib/pyg (el mismo código de la ventana P&G); el modelo solo explica. */
import { z } from "zod";
import { tasaDe } from "@/lib/analisis/comunes";
import { mercadoFondeo } from "@/lib/carry/mercado-snap";
import { edate, toN, toS } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import { conOficiales, FECHA_VERIFICACION, FUENTES, type ParametrosTributarios } from "@/lib/impuestos/parametros";
import { NOMBRE_CONTRIBUYENTE, PERFIL_INICIAL, tarifaMarginal, type PerfilContribuyente } from "@/lib/impuestos/perfil";
import { tasaEfectiva } from "@/lib/carry/config";
import { montos, NOMBRE_FONDEO } from "@/lib/carry/fondeo";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { conFondeo } from "@/lib/pyg/fondeo";
import { estadoPyG, textoRent, type EntradasPyG, type ResultadoPyG } from "@/lib/pyg/estado";
import { entradasPortafolio } from "@/lib/pyg/portafolio";
import type { ContextoHerramientas } from "./herramientas";

export const AVISO_TRIBUTARIO = "Estimación con fines académicos. No constituye asesoría tributaria; confirme con un contador.";

const TIPO = z.enum(["pn_no_obligada", "pn_obligada", "juridica"]);
const perfilEntrada = {
  tipo_contribuyente: TIPO.optional(),
  ingresos_anuales: z.number().min(0).max(1e13).optional(),
  tarifa_marginal_pct: z.number().min(0).max(60).optional(),
  incluir_gmf: z.boolean().optional(),
  ganancia_ocasional_activo_fijo: z.boolean().optional(),
};

export const ENTRADAS_IMPUESTOS = {
  calcular_impuestos: z.object({
    rendimientos_financieros: z.number().min(-1e13).max(1e13),
    utilidad_en_venta: z.number().min(-1e13).max(1e13).optional(),
    anios_tenencia: z.number().min(0).max(60).optional(),
    costos_deducibles: z.number().min(0).max(1e13).optional(),
    monto_retirado: z.number().min(0).max(1e14).optional(),
    ...perfilEntrada,
  }),
  calcular_pyg: z.object({
    sobre: z.enum(["titulo_calculadora", "portafolio"]).optional(),
    al_vencimiento: z.boolean().optional(),
    fecha_venta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tasa_venta_pct: z.number().min(-5).max(60).optional(),
    comisiones: z.number().min(0).max(1e12).optional(),
    incluir_fondeo: z.boolean().optional(),
    ...perfilEntrada,
  }),
} as const;

const props = {
  tipo_contribuyente: { type: "string", enum: TIPO.options, description: "pn_no_obligada (por defecto el perfil del usuario), pn_obligada o juridica." },
  ingresos_anuales: { type: "number", description: "Ingresos anuales de la cédula general en pesos, para la tarifa marginal del art. 241." },
  tarifa_marginal_pct: { type: "number", description: "Tarifa marginal en % si no se dan ingresos (persona natural)." },
  incluir_gmf: { type: "boolean", description: "Incluir el GMF (4 × 1.000) sobre lo retirado." },
  ganancia_ocasional_activo_fijo: {
    type: "boolean",
    description: "Tratar la utilidad en venta como ganancia ocasional si el título fue activo fijo 2 años o más. Por defecto no: la DIAN no lo ha confirmado para renta fija.",
  },
};

export const HERRAMIENTAS_IMPUESTOS = [
  {
    name: "calcular_impuestos",
    description:
      "Liquida los impuestos de unos rendimientos de renta fija con los parámetros tributarios verificados (lib/impuestos): componente inflacionario no gravado (solo persona natural no obligada), renta ordinaria con la tabla del art. 241 o la tarifa de personas jurídicas, ganancia ocasional del 15 % si la tenencia es de 2 años o más, retención en la fuente informativa (4 %) y GMF opcional. Úsala para cualquier cifra de impuestos; nunca calcules impuestos tú mismo. Por defecto usa el perfil tributario del usuario.",
    input_schema: {
      type: "object" as const,
      properties: {
        rendimientos_financieros: { type: "number", description: "Intereses y cupón corrido neto en pesos (renta ordinaria)." },
        utilidad_en_venta: { type: "number", description: "Utilidad o pérdida en precio limpio en pesos." },
        anios_tenencia: { type: "number", description: "Años de tenencia (2 o más: la utilidad en precio puede ser ganancia ocasional)." },
        costos_deducibles: { type: "number", description: "Comisiones y costo de fondeo en pesos." },
        monto_retirado: { type: "number", description: "Dinero que se retira (para el GMF)." },
        ...props,
      },
      required: ["rendimientos_financieros"],
    },
  },
  {
    name: "calcular_pyg",
    description:
      "Estado de resultados (P&G) completo con el motor y lib/pyg, igual a la ventana «Ver P&G»: cupones, utilidad en venta, cupón corrido, fondeo, comisiones, componente inflacionario, base gravable (renta ordinaria y ganancia ocasional), impuesto, retención, GMF, utilidad neta, pérdida de poder adquisitivo (IPC del DANE o proyectado) y utilidad real, más rentabilidades anualizadas nominal, después de impuestos y real. Para el título de la calculadora (al vencimiento por defecto, o vendiéndolo en una fecha a una tasa) o para el portafolio vendido en una fecha (por defecto en un año, a las mismas tasas).",
    input_schema: {
      type: "object" as const,
      properties: {
        sobre: { type: "string", enum: ["titulo_calculadora", "portafolio"], description: "Por defecto el título de la calculadora si hay; si no, el portafolio." },
        al_vencimiento: { type: "boolean", description: "Título: mantenerlo hasta el vencimiento (por defecto si no hay fecha de venta)." },
        fecha_venta: { type: "string", description: "Fecha de venta AAAA-MM-DD." },
        tasa_venta_pct: { type: "number", description: "Título: tasa de venta en % (TIR, TIR real o spread, según el tipo). Por defecto la misma de compra." },
        comisiones: { type: "number", description: "Comisiones en pesos." },
        incluir_fondeo: { type: "boolean", description: "Incluir el fondeo configurado en «Carry y fondeo» (por defecto no: capital propio)." },
        ...props,
      },
    },
  },
];

/** Perfil tributario: el del usuario con lo que pida el modelo encima. */
function perfilDe(
  ctx: ContextoHerramientas,
  i: { tipo_contribuyente?: PerfilContribuyente["tipo"]; ingresos_anuales?: number; tarifa_marginal_pct?: number; incluir_gmf?: boolean; ganancia_ocasional_activo_fijo?: boolean },
) {
  const base = ctx.tributario?.perfil ?? PERFIL_INICIAL;
  const perfil: PerfilContribuyente = {
    ...base,
    ...(i.tipo_contribuyente ? { tipo: i.tipo_contribuyente } : {}),
    ...(i.ingresos_anuales != null ? { ingresosAnuales: i.ingresos_anuales } : {}),
    ...(i.tarifa_marginal_pct != null ? { tarifaManual: i.tarifa_marginal_pct / 100, ingresosAnuales: i.ingresos_anuales ?? null } : {}),
    ...(i.incluir_gmf != null ? { gmf: i.incluir_gmf } : {}),
    ...(i.ganancia_ocasional_activo_fijo != null ? { gananciaOcasionalTitulos: i.ganancia_ocasional_activo_fijo } : {}),
  };
  return { perfil, params: ctx.tributario?.params ?? conOficiales(null) };
}

const pesos = (v: number) => (v < 0 ? "−" : "") + "$ " + nf(0).format(Math.abs(Math.round(v)));

/** Normas que respaldan el cálculo (para citar). */
function normas(p: ParametrosTributarios, r: ResultadoPyG, perfil: PerfilContribuyente) {
  const n = [
    `Retención ${F.pct(p.retencion, 0)}: ${FUENTES.retencion!.norma} (${FUENTES.retencion!.enlace})`,
    perfil.tipo === "juridica"
      ? `Renta ${F.pct(p.rentaJuridica, 0)}: ${FUENTES.rentaJuridica!.norma} (${FUENTES.rentaJuridica!.enlace})`
      : `Tabla del art. 241 con UVT ${F.cop(p.uvt)}: ${FUENTES.tabla241!.norma}; ${FUENTES.uvt!.norma}`,
  ];
  if (perfil.tipo === "pn_no_obligada")
    n.push(`Componente inflacionario ${F.pct(p.componenteInflacionario, 2)} (año ${p.anioComponente}): ${FUENTES.componenteInflacionario!.norma} (${FUENTES.componenteInflacionario!.enlace})`);
  if (r.gananciaOcasional > 0) n.push(`Ganancia ocasional ${F.pct(p.gananciaOcasional, 0)}: ${FUENTES.gananciaOcasional!.norma}; art. 300 E.T.`);
  else n.push(`Utilidad en venta como rendimiento financiero (renta ordinaria): ${FUENTES.aniosGananciaOcasional!.norma} (${FUENTES.aniosGananciaOcasional!.enlace})`);
  if (perfil.gmf) n.push(`GMF ${F.pct(p.gmf, 1)}: ${FUENTES.gmf!.norma}`);
  return n;
}

function salidaPyG(r: ResultadoPyG, perfil: PerfilContribuyente, p: ParametrosTributarios, extra: Record<string, unknown>) {
  return {
    ...extra,
    perfil: NOMBRE_CONTRIBUYENTE[perfil.tipo],
    tarifa:
      perfil.tipo === "juridica"
        ? `${F.pct(p.rentaJuridica, 0)} (art. 240)`
        : perfil.ingresosAnuales != null
          ? `tabla del art. 241 sobre ingresos de ${pesos(perfil.ingresosAnuales)} (marginal ${F.pct(tarifaMarginal(perfil.ingresosAnuales, p), 0)})`
          : `tarifa marginal ingresada ${F.pct(perfil.tarifaManual, 0)}`,
    lineas: r.lineas.map((l) => ({ concepto: `${l.signo} ${l.etiqueta}`, valor: pesos(l.valor), ...(r.capital ? { pct_del_capital: F.pct(l.valor / r.capital, 2) } : {}), ...(l.nota ? { nota: l.nota } : {}) })),
    dias_tenencia: r.dias,
    ...(r.capital
      ? {
          rentabilidad_nominal_ea: textoRent(r.rentNominal),
          rentabilidad_despues_de_impuestos_ea: textoRent(r.rentDespues),
          rentabilidad_real_ea: textoRent(r.rentReal),
          frase: r.frase,
        }
      : {}),
    notas: r.notas,
    normas: normas(p, r, perfil),
    parametros_verificados_el: FECHA_VERIFICACION,
    aviso: AVISO_TRIBUTARIO,
  };
}

export function herramientaImpuestos(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_IMPUESTOS.calcular_impuestos>) {
  const { perfil, params } = perfilDe(ctx, i);
  const anios = i.anios_tenencia ?? 1;
  const compra = ctx.fecha;
  const venta = toS(edate(toN(compra), Math.round(anios * 12)) || toN(compra) + 365);
  const util = i.utilidad_en_venta ?? 0;
  const e: EntradasPyG = {
    fechaCompra: compra,
    fechaVenta: venta,
    capital: 0,
    limpioCompra: 0,
    corridoCompra: 0,
    limpioVenta: util,
    corridoVenta: 0,
    cupones: [{ fecha: venta, interes: i.rendimientos_financieros, amort: 0 }],
    costoFondeo: 0,
    comisiones: i.costos_deducibles ?? 0,
    inflacion: 0,
    inflacionProyectada: false,
    indexado: false,
  };
  const r = estadoPyG(e, perfil, params);
  // El GMF de la ventana se calcula sobre lo recibido; aquí sobre el monto retirado que se indique.
  const gmf = perfil.gmf ? params.gmf * (i.monto_retirado ?? Math.max(0, i.rendimientos_financieros + util)) : 0;
  const quitar = new Set(["inflacion", "real", "gmf", "neta"]);
  const base = salidaPyG({ ...r, lineas: r.lineas.filter((l) => !quitar.has(l.clave)), capital: 0 }, perfil, params, {
    supuesto: `Tenencia de ${nf(1).format(anios)} años${anios >= params.aniosGananciaOcasional && perfil.gananciaOcasionalTitulos ? " (la utilidad en venta se trata como ganancia ocasional: el usuario la marcó como activo fijo)" : " (la utilidad en venta es renta ordinaria)"}`,
  });
  return {
    ...base,
    impuesto_estimado: pesos(r.impuesto),
    ...(perfil.gmf ? { gmf: pesos(gmf) } : {}),
    neto_despues_de_impuestos: pesos(r.utilidadAntes - r.impuesto - gmf),
    tarifa_efectiva: r.utilidadAntes > 0 ? F.pct(r.impuesto / r.utilidadAntes, 2) : "—",
  };
}

export function herramientaPyG(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_IMPUESTOS.calcular_pyg>) {
  const { perfil, params } = perfilDe(ctx, i);
  const sobre = i.sobre ?? (ctx.titulo ? "titulo_calculadora" : "portafolio");
  const inf = { ipc: ctx.snap.datos.ipc, exp: ctx.snap.datos.exp };
  let e: EntradasPyG | { error: string };
  let supuesto: string;
  if (sobre === "titulo_calculadora") {
    const t = ctx.titulo;
    if (!t) return { error: "No hay un título válido abierto en la calculadora." };
    const alVenc = i.al_vencimiento ?? !i.fecha_venta;
    const fechaVenta = alVenc ? t.b.vencimiento : (i.fecha_venta as string);
    e = entradasDesdeMotor(
      ctx.motor,
      t.b,
      t.o,
      alVenc ? { alVencimiento: true, comisiones: i.comisiones } : { fechaVenta, tasaVenta: i.tasa_venta_pct != null ? i.tasa_venta_pct / 100 : tasaDe(t.b), comisiones: i.comisiones },
      inf,
    );
    supuesto = alVenc
      ? `${t.titulo}: se mantiene hasta el vencimiento (${F.date(t.b.vencimiento)})`
      : `${t.titulo}: venta el ${F.date(fechaVenta)} a ${i.tasa_venta_pct != null ? `${nf(3).format(i.tasa_venta_pct)} %` : "la misma tasa de compra"}`;
  } else {
    if (!ctx.portafolio.length) return { error: "El portafolio está vacío." };
    const fechaVenta = i.fecha_venta ?? toS(edate(toN(ctx.portafolio[0].b.valoracion), 12));
    const pf = entradasPortafolio(ctx.motor, ctx.portafolio.map((x) => ({ b: x.b, o: x.o })), fechaVenta, inf);
    e = "error" in pf ? pf : { ...pf, comisiones: i.comisiones ?? 0 };
    supuesto = `Portafolio de ${ctx.portafolio.length} títulos vendido el ${F.date(fechaVenta)} a las mismas tasas de compra (los que vencen antes, al vencimiento)`;
  }
  if ("error" in e) return e;
  // Fondeo del panel de carry solo si se pide (misma lógica que el P&G de la página)
  let fondeoTxt = "Capital propio (sin fondeo).";
  if (i.incluir_fondeo) {
    const c = ctx.fondeo;
    const m = mercadoFondeo(ctx.snap);
    const t = c && c.tipo !== "propio" ? tasaEfectiva(c, m) : null;
    if (!c || c.tipo === "propio" || t == null) return { error: "El usuario no tiene un fondeo configurado en «Carry y fondeo» (o falta la tasa)." };
    e = conFondeo(e, { fondeado: montos(e.capital, c).fondeado, tasaEA: t });
    fondeoTxt = `Fondeo ${NOMBRE_FONDEO[c.tipo].toLowerCase()} a ${F.pct(t, 2)} E.A., haircut ${F.pct(c.haircut, 0)}; % sobre el capital propio.`;
  }
  return salidaPyG(estadoPyG(e, perfil, params), perfil, params, {
    supuesto,
    fondeo: fondeoTxt,
    inflacion_del_periodo: `${F.pct(e.inflacion, 2)} (${e.inflacionProyectada ? "proyectada con las expectativas de la encuesta del BanRep" : "IPC del DANE"})`,
  });
}
