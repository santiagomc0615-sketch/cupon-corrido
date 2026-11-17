/* Estado de resultados (P&G) de una inversión en renta fija al venderla o al vencimiento, con
   impuestos de Colombia e inflación. Función pura sobre cifras en pesos ya calculadas por el motor.
   - Utilidad en venta = precio limpio de venta − precio limpio de compra (× nominal × UVR). Al
     vencimiento el precio de venta es 100. El capital devuelto no es utilidad.
   - Fondeo (opcional, lib/pyg/fondeo.ts): misma lógica de lib/carry; los % y la pérdida por
     inflación se miden sobre el capital propio.
   - Impuestos: cupones, corrido y utilidad en venta son rendimientos financieros (renta ordinaria).
     Ganancia ocasional solo si el usuario marca el título como activo fijo, con 2 años o más y
     utilidad positiva. Si el resultado total es pérdida, no hay impuesto (pérdida fiscal).
   Estimación académica: no constituye asesoría tributaria. */
import { edate, toN } from "@/lib/engine";
import type { ParametrosTributarios } from "@/lib/impuestos/parametros";
import { impuestoRentaOrdinaria, type PerfilContribuyente } from "@/lib/impuestos/perfil";
import type { DetalleFondeo } from "./fondeo";

export interface CuponRecibido {
  fecha: string;
  /** Intereses en pesos. */
  interes: number;
  /** Amortización de capital en pesos (devolución de capital, no utilidad). */
  amort: number;
}

export interface EntradasPyG {
  fechaCompra: string;
  fechaVenta: string;
  /** Lo girado al comprar (precio sucio), en pesos. */
  capital: number;
  /** Precio limpio de compra y cupón corrido pagado, en pesos. */
  limpioCompra: number;
  corridoCompra: number;
  /** Precio limpio de venta (al vencimiento, 100 % del nominal) y cupón corrido recibido, en pesos. */
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
  /** Fondeo incluido (lib/pyg/fondeo.ts). Sin él, todo es capital propio. */
  fondeo?: DetalleFondeo;
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
  /** Capital propio: base de los % y de la pérdida por inflación. */
  capital: number;
  utilidadAntes: number;
  impuesto: number;
  neta: number;
  real: number;
  rentaOrdinaria: number;
  gananciaOcasional: number;
  largoPlazo: boolean;
  perdidaFiscal: boolean;
  /** Rentabilidades E.A. sobre el capital propio; null si la pérdida supera el capital (no aplica). */
  rentNominal: number | null;
  rentDespues: number | null;
  rentReal: number | null;
  frase: string;
  notas: string[];
}

/** Texto de una rentabilidad E.A.: «No aplica» si se pierde todo el capital o más. */
export const textoRent = (x: number | null, d = 2) => (x == null ? "No aplica" : (x * 100).toFixed(d).replace(".", ",") + " %");

/** Rentabilidad efectiva anual de una ganancia sobre el capital en `dias`; null si se pierde todo el capital o más. */
export const anualizar = (ganancia: number, capital: number, dias: number): number | null =>
  capital > 0 && dias > 0 ? (1 + ganancia / capital > 0 ? Math.pow(1 + ganancia / capital, 365 / dias) - 1 : null) : null;

export function estadoPyG(e: EntradasPyG, perfil: PerfilContribuyente, p: ParametrosTributarios): ResultadoPyG {
  const dias = toN(e.fechaVenta) - toN(e.fechaCompra);
  const intereses = e.cupones.reduce((s, c) => s + c.interes, 0);
  const amort = e.cupones.reduce((s, c) => s + c.amort, 0);
  // Las amortizaciones devuelven capital al costo: solo la diferencia de precio limpio es utilidad.
  const utilVenta = e.limpioVenta + amort - e.limpioCompra;
  const corridoNeto = e.corridoVenta - e.corridoCompra;
  const costoFondeo = e.costoFondeo;
  const utilidadAntes = intereses + utilVenta + corridoNeto - costoFondeo - e.comisiones;
  const capital = e.fondeo ? e.fondeo.capitalPropio : e.capital;

  // Ganancia ocasional (art. 300 E.T.): solo si el usuario declara el título activo fijo, con
  // tenencia de 2 años o más y utilidad positiva. Por defecto la utilidad en venta es renta ordinaria.
  const largoPlazo = toN(e.fechaVenta) >= edate(toN(e.fechaCompra), 12 * p.aniosGananciaOcasional);
  const aplicaGO = !!perfil.gananciaOcasionalTitulos && largoPlazo && utilVenta > 0;
  const go = aplicaGO ? utilVenta : 0;
  const rendFinancieros = intereses + corridoNeto + (aplicaGO ? 0 : utilVenta);

  // Componente inflacionario: solo persona natural NO obligada a llevar contabilidad. Para ella, el costo
  // del fondeo se deduce en la misma proporción gravable (sin su componente inflacionario).
  const noObligada = perfil.tipo === "pn_no_obligada";
  const noGravado = noObligada ? p.componenteInflacionario * Math.max(0, rendFinancieros) : 0;
  const fondeoDeducible = noObligada ? costoFondeo * (1 - p.componenteInflacionario) : costoFondeo;
  const perdidaFiscal = utilidadAntes <= 0;
  const baseOrdinaria = perdidaFiscal ? 0 : Math.max(0, rendFinancieros - noGravado - fondeoDeducible - e.comisiones);
  const ord = impuestoRentaOrdinaria(baseOrdinaria, perfil, p);
  const impGO = perdidaFiscal ? 0 : go * p.gananciaOcasional;
  const impuesto = perdidaFiscal ? 0 : ord.impuesto + impGO;
  const retencion = p.retencion * Math.max(0, intereses + corridoNeto + utilVenta);
  const retirado = e.limpioVenta + e.corridoVenta + intereses + amort;
  const gmf = perfil.gmf ? p.gmf * Math.max(0, retirado) : 0;
  const neta = utilidadAntes - impuesto - gmf;
  const perdidaPoder = capital * e.inflacion;
  const real = neta - perdidaPoder;

  const lineas: LineaPyG[] = [
    { clave: "cupones", signo: "+", etiqueta: "Cupones recibidos durante la tenencia", valor: intereses, tipo: "suma" },
    {
      clave: "venta",
      signo: "+",
      etiqueta: utilVenta >= 0 ? "Utilidad en venta (precio limpio)" : "Pérdida en venta (precio limpio)",
      valor: utilVenta,
      tipo: "suma",
    },
    { clave: "corrido", signo: "±", etiqueta: "Cupón corrido: recibido al vender − pagado al comprar", valor: corridoNeto, tipo: "suma" },
  ];
  if (e.fondeo)
    lineas.push({
      clave: "fondeo",
      signo: "−",
      etiqueta: "Costo de fondeo",
      valor: -costoFondeo,
      tipo: "resta",
      nota: `Intereses del préstamo de ${Math.round(e.fondeo.fondeado).toLocaleString("es-CO")} a ${(e.fondeo.tasaEA * 100).toFixed(2).replace(".", ",")} % E.A.; los cupones lo van pagando`,
    });
  lineas.push({ clave: "comisiones", signo: "−", etiqueta: "Comisiones", valor: -e.comisiones, tipo: "resta" });
  lineas.push({ clave: "uai", signo: "=", etiqueta: "Utilidad antes de impuestos", valor: utilidadAntes, tipo: "total" });
  if (perdidaFiscal) {
    lineas.push({ clave: "perdidaFiscal", signo: "i", etiqueta: "Pérdida fiscal (no hay impuesto)", valor: utilidadAntes, tipo: "info", nota: "Podría compensarse con otras rentas según el caso" });
  } else {
    if (noGravado)
      lineas.push({
        clave: "noGravado",
        signo: "−",
        etiqueta: `Componente inflacionario no gravado (${(p.componenteInflacionario * 100).toFixed(2).replace(".", ",")} %)`,
        valor: -noGravado,
        tipo: "resta",
        nota: `Sobre los rendimientos financieros · año gravable ${p.anioComponente}`,
      });
    lineas.push({
      clave: "baseOrd",
      signo: "=",
      etiqueta: "Base gravable · renta ordinaria",
      valor: baseOrdinaria,
      tipo: "info",
      nota: e.fondeo ? (noObligada ? "Fondeo deducido en la proporción gravable" : "Fondeo deducido") : undefined,
    });
    if (aplicaGO) lineas.push({ clave: "baseGO", signo: "=", etiqueta: "Base gravable · ganancia ocasional", valor: go, tipo: "info", nota: `Activo fijo con ${p.aniosGananciaOcasional} años o más` });
  }
  lineas.push({
    clave: "impuesto",
    signo: "−",
    etiqueta: "Impuesto estimado",
    valor: -impuesto,
    tipo: "resta",
    nota: perdidaFiscal ? "Sin impuesto: el resultado es pérdida" : `${ord.metodo}${impGO ? ` · ganancia ocasional ${(p.gananciaOcasional * 100).toFixed(0)} %` : ""}`,
  });
  lineas.push({ clave: "retencion", signo: "i", etiqueta: "Retención en la fuente ya practicada", valor: retencion, tipo: "info", nota: "Es un anticipo del impuesto, no un costo adicional" });
  if (perfil.gmf) lineas.push({ clave: "gmf", signo: "−", etiqueta: "GMF estimado (4 × 1.000)", valor: -gmf, tipo: "resta" });
  lineas.push({ clave: "neta", signo: "=", etiqueta: "Utilidad neta después de impuestos", valor: neta, tipo: "total" });
  lineas.push({
    clave: "inflacion",
    signo: "−",
    etiqueta: "Pérdida de poder adquisitivo",
    valor: -perdidaPoder,
    tipo: "resta",
    nota: `${e.fondeo ? "Capital propio" : "Capital"} × inflación acumulada${e.inflacionProyectada ? " (proyectada con expectativas)" : " (IPC del DANE)"}`,
  });
  lineas.push({ clave: "real", signo: "=", etiqueta: "Utilidad real neta", valor: real, tipo: "total" });

  const rentReal = anualizar(real, capital, dias);
  const pct = (x: number) => (x * 100).toFixed(2).replace(".", ",");
  const frase =
    rentReal == null
      ? "Después de impuestos e inflación se perdería todo el capital propio o más: la rentabilidad anual no aplica."
      : rentReal >= 0
        ? `Después de impuestos e inflación, tu dinero creció ${pct(rentReal)} % real al año.`
        : `Después de impuestos e inflación, tu dinero perdió ${pct(-rentReal)} % real al año.`;
  const notas: string[] = [];
  if (e.indexado)
    notas.push("Este título paga según la inflación (IPC o UVR): su rendimiento nominal ya incluye la inflación. La ganancia real se muestra igual para compararlo con los demás.");
  if (e.fondeo) notas.push("Con fondeo, los % y la pérdida por inflación se miden sobre el capital propio (giro × haircut).");
  if (aplicaGO) notas.push("La utilidad en precio se trató como ganancia ocasional porque usted marcó el título como activo fijo con dos años o más. La DIAN no lo ha confirmado para renta fija.");
  if (perfil.tipo !== "juridica" && perfil.ingresosAnuales == null) notas.push("Sin ingresos anuales se usa la tarifa marginal ingresada; con ellos se aplica la tabla del art. 241.");

  return {
    lineas,
    dias,
    capital,
    utilidadAntes,
    impuesto,
    neta,
    real,
    rentaOrdinaria: baseOrdinaria,
    gananciaOcasional: aplicaGO ? go : 0,
    largoPlazo,
    perdidaFiscal,
    rentNominal: anualizar(utilidadAntes, capital, dias),
    rentDespues: anualizar(neta, capital, dias),
    rentReal,
    frase,
    notas,
  };
}
