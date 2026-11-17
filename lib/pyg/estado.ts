/* Estado de resultados (P&G) de una inversión en renta fija al venderla o al vencimiento, con
   impuestos de Colombia e inflación. Función pura sobre cifras en pesos ya calculadas por el motor.
   Estimación académica: no constituye asesoría tributaria. */
import { edate, toN } from "@/lib/engine";
import type { ParametrosTributarios } from "@/lib/impuestos/parametros";
import { impuestoRentaOrdinaria, type PerfilContribuyente } from "@/lib/impuestos/perfil";

export interface CuponRecibido {
  fecha: string;
  /** Intereses en pesos. */
  interes: number;
  /** Amortización de capital en pesos. */
  amort: number;
}

export interface EntradasPyG {
  fechaCompra: string;
  fechaVenta: string;
  /** Capital invertido: lo girado al comprar (precio sucio), en pesos. */
  capital: number;
  /** Precio limpio de compra y cupón corrido pagado, en pesos. */
  limpioCompra: number;
  corridoCompra: number;
  /** Precio limpio de venta y cupón corrido recibido, en pesos (al vencimiento: 0 y el capital va en la amortización). */
  limpioVenta: number;
  corridoVenta: number;
  cupones: CuponRecibido[];
  costoFondeo: number;
  comisiones: number;
  /** Inflación acumulada del periodo (fracción) y si es proyectada. */
  inflacion: number;
  inflacionProyectada: boolean;
  /** Título indexado a la inflación (IPC o UVR). */
  indexado: boolean;
}

export type TipoLinea = "suma" | "resta" | "total" | "info";

export interface LineaPyG {
  clave: string;
  signo: string;
  etiqueta: string;
  valor: number;
  tipo: TipoLinea;
  nota?: string;
}

export interface ResultadoPyG {
  lineas: LineaPyG[];
  dias: number;
  capital: number;
  utilidadAntes: number;
  impuesto: number;
  neta: number;
  real: number;
  rentaOrdinaria: number;
  gananciaOcasional: number;
  largoPlazo: boolean;
  /** Rentabilidades efectivas anuales sobre el capital invertido. */
  rentNominal: number;
  rentDespues: number;
  rentReal: number;
  frase: string;
  notas: string[];
}

/** Rentabilidad efectiva anual de una ganancia sobre el capital en `dias`. */
export const anualizar = (ganancia: number, capital: number, dias: number) =>
  capital > 0 && dias > 0 ? (1 + ganancia / capital > 0 ? Math.pow(1 + ganancia / capital, 365 / dias) - 1 : -1) : 0;

export function estadoPyG(e: EntradasPyG, perfil: PerfilContribuyente, p: ParametrosTributarios): ResultadoPyG {
  const dias = toN(e.fechaVenta) - toN(e.fechaCompra);
  const intereses = e.cupones.reduce((s, c) => s + c.interes, 0);
  const amort = e.cupones.reduce((s, c) => s + c.amort, 0);
  const utilVenta = e.limpioVenta + amort - e.limpioCompra;
  const corridoNeto = e.corridoVenta - e.corridoCompra;
  const utilidadAntes = intereses + utilVenta + corridoNeto - e.costoFondeo - e.comisiones;

  // Ganancia ocasional: utilidad en venta de un título poseído dos años o más (art. 300 E.T.).
  const largoPlazo = toN(e.fechaVenta) >= edate(toN(e.fechaCompra), 12 * p.aniosGananciaOcasional);
  const rendFinancieros = intereses + corridoNeto + (largoPlazo ? 0 : utilVenta);
  const go = largoPlazo ? Math.max(0, utilVenta) : 0;
  const noGravado = perfil.tipo === "pn_no_obligada" ? p.componenteInflacionario * Math.max(0, rendFinancieros) : 0;
  const baseOrdinaria = Math.max(0, rendFinancieros - noGravado - e.costoFondeo - e.comisiones);
  const ord = impuestoRentaOrdinaria(baseOrdinaria, perfil, p);
  const impGO = go * p.gananciaOcasional;
  const impuesto = ord.impuesto + impGO;
  const retencion = p.retencion * Math.max(0, intereses + corridoNeto + utilVenta);
  const retirado = e.limpioVenta + e.corridoVenta + intereses + amort;
  const gmf = perfil.gmf ? p.gmf * Math.max(0, retirado) : 0;
  const neta = utilidadAntes - impuesto - gmf;
  const perdidaPoder = e.capital * e.inflacion;
  const real = neta - perdidaPoder;

  const lineas: LineaPyG[] = [
    { clave: "cupones", signo: "+", etiqueta: "Cupones recibidos durante la tenencia", valor: intereses, tipo: "suma" },
    {
      clave: "venta",
      signo: "+",
      etiqueta: utilVenta >= 0 ? "Utilidad en venta (precio limpio)" : "Pérdida en venta (precio limpio)",
      valor: utilVenta,
      tipo: "suma",
      nota: amort ? "Incluye la amortización de capital recibida" : undefined,
    },
    { clave: "corrido", signo: "±", etiqueta: "Cupón corrido: recibido al vender − pagado al comprar", valor: corridoNeto, tipo: "suma" },
  ];
  if (e.costoFondeo) lineas.push({ clave: "fondeo", signo: "−", etiqueta: "Costo de fondeo", valor: -e.costoFondeo, tipo: "resta" });
  lineas.push({ clave: "comisiones", signo: "−", etiqueta: "Comisiones", valor: -e.comisiones, tipo: "resta" });
  lineas.push({ clave: "uai", signo: "=", etiqueta: "Utilidad antes de impuestos", valor: utilidadAntes, tipo: "total" });
  if (noGravado)
    lineas.push({
      clave: "noGravado",
      signo: "−",
      etiqueta: `Componente inflacionario no gravado (${(p.componenteInflacionario * 100).toFixed(2).replace(".", ",")} %)`,
      valor: -noGravado,
      tipo: "resta",
      nota: `Sobre los rendimientos financieros · año gravable ${p.anioComponente}`,
    });
  lineas.push({ clave: "baseOrd", signo: "=", etiqueta: "Base gravable · renta ordinaria", valor: baseOrdinaria, tipo: "info" });
  if (largoPlazo) lineas.push({ clave: "baseGO", signo: "=", etiqueta: "Base gravable · ganancia ocasional", valor: go, tipo: "info", nota: `Tenencia de ${p.aniosGananciaOcasional} años o más` });
  lineas.push({
    clave: "impuesto",
    signo: "−",
    etiqueta: "Impuesto estimado",
    valor: -impuesto,
    tipo: "resta",
    nota: `${ord.metodo}${impGO ? ` · ganancia ocasional ${(p.gananciaOcasional * 100).toFixed(0)} %` : ""}`,
  });
  lineas.push({
    clave: "retencion",
    signo: "i",
    etiqueta: "Retención en la fuente ya practicada",
    valor: retencion,
    tipo: "info",
    nota: "Es un anticipo del impuesto, no un costo adicional",
  });
  if (perfil.gmf) lineas.push({ clave: "gmf", signo: "−", etiqueta: "GMF estimado (4 × 1.000)", valor: -gmf, tipo: "resta" });
  lineas.push({ clave: "neta", signo: "=", etiqueta: "Utilidad neta después de impuestos", valor: neta, tipo: "total" });
  lineas.push({
    clave: "inflacion",
    signo: "−",
    etiqueta: "Pérdida de poder adquisitivo",
    valor: -perdidaPoder,
    tipo: "resta",
    nota: `Capital × inflación acumulada${e.inflacionProyectada ? " (proyectada con expectativas)" : " (IPC del DANE)"}`,
  });
  lineas.push({ clave: "real", signo: "=", etiqueta: "Utilidad real neta", valor: real, tipo: "total" });

  const rentReal = anualizar(real, e.capital, dias);
  const pct = (x: number) => (x * 100).toFixed(2).replace(".", ",");
  const frase =
    rentReal >= 0
      ? `Después de impuestos e inflación, tu dinero creció ${pct(rentReal)} % real al año.`
      : `Después de impuestos e inflación, tu dinero perdió ${pct(-rentReal)} % real al año.`;
  const notas: string[] = [];
  if (e.indexado)
    notas.push("Este título paga según la inflación (IPC o UVR): su rendimiento nominal ya incluye la inflación. La ganancia real se muestra igual para compararlo con los demás.");
  if (largoPlazo) notas.push("La utilidad en precio se trató como ganancia ocasional porque el título se tuvo dos años o más como inversión (activo fijo). Si lo tenía para negociar, es renta ordinaria.");
  if (rendFinancieros - e.costoFondeo - e.comisiones < 0) notas.push("Hay pérdida en la renta ordinaria: en la declaración podría compensar otras rentas de la misma cédula.");
  if (perfil.tipo !== "juridica" && perfil.ingresosAnuales == null) notas.push("Sin ingresos anuales se usa la tarifa marginal ingresada; con ellos se aplica la tabla del art. 241.");

  return {
    lineas,
    dias,
    capital: e.capital,
    utilidadAntes,
    impuesto,
    neta,
    real,
    rentaOrdinaria: baseOrdinaria,
    gananciaOcasional: go,
    largoPlazo,
    rentNominal: anualizar(utilidadAntes, e.capital, dias),
    rentDespues: anualizar(neta, e.capital, dias),
    rentReal,
    frase,
    notas,
  };
}
