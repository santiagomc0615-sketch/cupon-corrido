/* «Buscar objetivo» como en Excel: «Quiero que [resultado] sea igual a [valor] cambiando [variable]».
   No toca lib/engine: cada prueba arma las entradas de la calculadora, llama al motor y lee el resultado;
   el solver (Brent, tolerancia 1e-8) busca la variable. Unidades como en la calculadora: tasas y
   spreads en %, precios en % del nominal, montos en pesos.
   - «Comprar a la par al emitir»: emisión = fecha de valoración, precio 100 (IBR: precio dado 100;
     TF/UVR: tasa de compra = cupón; IPC: spread de compra = spread facial).
   - «Primer periodo con la FRA» (IBR con «Curva FRAC», a la par): el periodo que empieza en la compra
     se proyecta con la FRA de esa fecha y no con el IBR publicado (convención de muchos ejercicios
     de clase). Se logra valorando un día antes; la TIR se mide desde la compra con los mismos flujos. */
import { toEngine, type EntradasUI } from "@/lib/calculadora";
import { carryConConfig, type ConfigFondeo, type MercadoFondeo } from "@/lib/carry/config";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { days, den, esError, solveYield, toN, toS, type Bono, type FilaCronograma, type Motor, type ResultadoValoracion, type TipoBono } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import { resolver, TOLERANCIA, type Raiz } from "./solver";

export type ClaveResultado = "tir" | "tirXirr" | "tirReal" | "sucio" | "limpio" | "giro" | "rentVenta" | "carry" | "roe";
export type ClaveVariable = "spreadFacial" | "spreadCompra" | "tasaCompra" | "tasaCupon" | "precioCompra" | "nominal";

const TODOS: TipoBono[] = ["TF", "IBR", "IPC", "UVR"];
const INDEXADOS: TipoBono[] = ["IBR", "IPC"];
const TASA_FIJA: TipoBono[] = ["TF", "UVR"];

export const RESULTADOS: Record<ClaveResultado, { nombre: string; corto: string; unidad: "%" | "$"; sufijo: string; tipos: TipoBono[]; requiere?: "venta" | "fondeo" }> = {
  tir: { nombre: "TIR E.A.", corto: "la TIR", unidad: "%", sufijo: " E.A.", tipos: TODOS },
  tirXirr: { nombre: "TIR E.A. con días reales/365 (XIRR)", corto: "la TIR (XIRR)", unidad: "%", sufijo: " E.A.", tipos: TODOS },
  tirReal: { nombre: "TIR real", corto: "la TIR real", unidad: "%", sufijo: " real", tipos: ["UVR"] },
  sucio: { nombre: "Precio sucio", corto: "el precio sucio", unidad: "%", sufijo: "", tipos: TODOS },
  limpio: { nombre: "Precio limpio", corto: "el precio limpio", unidad: "%", sufijo: "", tipos: TODOS },
  giro: { nombre: "Valor de giro", corto: "el valor de giro", unidad: "$", sufijo: "", tipos: TODOS },
  rentVenta: { nombre: "Rentabilidad de la venta", corto: "la rentabilidad de la venta", unidad: "%", sufijo: " E.A.", tipos: TODOS, requiere: "venta" },
  carry: { nombre: "Carry a un horizonte", corto: "el carry", unidad: "$", sufijo: "", tipos: TODOS, requiere: "fondeo" },
  roe: { nombre: "ROE a un horizonte", corto: "el ROE", unidad: "%", sufijo: "", tipos: TODOS, requiere: "fondeo" },
};

export const VARIABLES: Record<ClaveVariable, { nombre: string; unidad: "%" | "$"; tipos: TipoBono[]; rango: (t: TipoBono) => [number, number] }> = {
  spreadFacial: { nombre: "Spread facial", unidad: "%", tipos: INDEXADOS, rango: () => [-5, 30] },
  spreadCompra: { nombre: "Spread de compra", unidad: "%", tipos: INDEXADOS, rango: () => [-5, 30] },
  tasaCompra: { nombre: "Tasa de compra", unidad: "%", tipos: TASA_FIJA, rango: (t) => (t === "UVR" ? [-5, 30] : [-5, 60]) },
  tasaCupon: { nombre: "Tasa cupón", unidad: "%", tipos: TASA_FIJA, rango: (t) => (t === "UVR" ? [0, 30] : [0, 60]) },
  precioCompra: { nombre: "Precio de compra (sucio)", unidad: "%", tipos: TODOS, rango: () => [20, 250] },
  nominal: { nombre: "Nominal", unidad: "$", tipos: TODOS, rango: () => [1, 1e14] },
};

export const resultadosPara = (t: TipoBono) => (Object.keys(RESULTADOS) as ClaveResultado[]).filter((k) => RESULTADOS[k].tipos.includes(t));
export const variablesPara = (t: TipoBono) => (Object.keys(VARIABLES) as ClaveVariable[]).filter((k) => VARIABLES[k].tipos.includes(t));

export interface ContextoObjetivo {
  motor: Motor;
  /** Venta anticipada (para «rentabilidad de la venta»): fecha y tasa de venta en % E.A. */
  venta?: { fecha: string; tasa: number } | null;
  /** Fondeo (para carry y ROE) y horizonte en días (30, 90 o 365). */
  fondeo?: { config: ConfigFondeo; mercado: MercadoFondeo; horizonte: number } | null;
}

export interface Problema {
  entradas: EntradasUI;
  resultado: ClaveResultado;
  /** Valor objetivo en las unidades del resultado (% o pesos). */
  objetivo: number;
  variable: ClaveVariable;
  aLaPar?: boolean;
  /** IBR con «Curva FRAC», a la par: el primer periodo se proyecta con la FRA. */
  primerPeriodoFRA?: boolean;
}

export interface Flujo {
  fecha: string;
  dias: number;
  /** Tasa del periodo en % (IBR/IPC: índice proyectado; TF/UVR: cupón). */
  indice: number | null;
  tasa: number;
  cupon: number;
  amortizacion: number;
  flujo: number;
  fuente?: string;
  /** Años desde la compra en la convención de la TIR. */
  t: number;
  /** Valor presente a la TIR de la respuesta. */
  vp: number;
}

export interface Evaluacion {
  entradas: EntradasUI;
  b: Bono;
  o: ResultadoValoracion;
  valor: number;
}

const pct = (x: number) => x * 100;
const esUsoPar = (p: Problema) => !!p.aLaPar && p.variable !== "precioCompra";
const fraPrimero = (p: Problema) => !!p.primerPeriodoFRA && esUsoPar(p) && p.entradas.tipo === "IBR";

/** Campo de la calculadora que cambia cada variable. */
export function campoDe(v: ClaveVariable, t: TipoBono): string {
  if (v === "spreadFacial") return "spread";
  if (v === "tasaCupon") return "cupon";
  if (v === "precioCompra") return t === "IBR" ? "precioDado" : TASA_FIJA.includes(t) ? "tasaCompra" : "spreadCompra";
  return v;
}

/** Entradas con la variable en x (y, a la par, emisión = valoración y compra = facial). */
export function aplicar(p: Problema, x: number): EntradasUI {
  const t = p.entradas.tipo as TipoBono;
  const e: EntradasUI = { ...p.entradas };
  if (p.variable !== "precioCompra") e[campoDe(p.variable, t)] = x;
  if (esUsoPar(p)) {
    e.emision = String(e.valoracion);
    if (INDEXADOS.includes(t)) {
      const s = p.variable === "spreadCompra" ? x : Number(e.spread);
      e.spread = s;
      e.spreadCompra = s;
      if (t === "IBR") e.precioDado = 100;
    } else {
      const c = p.variable === "tasaCompra" ? x : Number(e.cupon);
      e.cupon = c;
      e.tasaCompra = c;
    }
  }
  if (fraPrimero(p)) e.valoracion = toS(toN(String(e.valoracion)) - 1);
  return e;
}

function valorar(motor: Motor, e: EntradasUI): { b: Bono; o: ResultadoValoracion } {
  const b = toEngine(e);
  const o = motor.price(b);
  if (esError(o)) throw new Error(o.error);
  return { b, o };
}

/** Entradas con la tasa (o el spread) de compra que da el precio sucio P. */
function compraParaPrecio(motor: Motor, e: EntradasUI, P: number): EntradasUI {
  const t = e.tipo as TipoBono;
  const campo = campoDe("precioCompra", t);
  const [lo, hi] = t === "TF" ? [-5, 60] : [-5, 30];
  const s = resolver((r) => valorar(motor, { ...e, [campo]: r }).o.dirty - P, lo, hi, Number(e[campo]), 1e-10);
  if (!s.ok) throw new Error("No hay una tasa de compra que dé ese precio.");
  return { ...e, [campo]: s.raiz.x };
}

/** Flujos futuros (por 100 de nominal) con su fecha y el tiempo en la convención de la TIR. */
function flujosDesde(o: ResultadoValoracion, compra: number, base: string, xirr: boolean) {
  return o.rows
    .filter((r) => r.pay > compra)
    .map((r) => ({ r, n: r.pay, cf: r.L, t: xirr ? (r.pay - compra) / 365 : days(compra, r.pay, base as never) / den(base as never) }));
}

/** TIR de los flujos del motor medida desde la compra (para «primer periodo con la FRA» y XIRR). */
function tirDesde(o: ResultadoValoracion, compra: number, precio: number, base: string, xirr: boolean): number {
  return solveYield(flujosDesde(o, compra, base, xirr), precio, 0.1);
}

/** Valor del resultado (en sus unidades) para unas entradas ya armadas. */
export function medir(ctx: ContextoObjetivo, p: Problema, e: EntradasUI): Evaluacion {
  const { b, o } = valorar(ctx.motor, e);
  const compra = toN(String(p.entradas.valoracion));
  const fra = fraPrimero(p);
  const precio = fra ? 100 : o.dirty;
  let valor: number;
  switch (p.resultado) {
    case "tir":
      valor = fra ? pct(tirDesde(o, compra, precio, String(e.base), false)) : pct(o.tipo === "UVR" ? o.yieldCOP : o.irr);
      break;
    case "tirXirr":
      valor = o.tipo === "UVR" && !fra ? pct(o.yieldCOP) : pct(tirDesde(o, compra, precio, String(e.base), true));
      break;
    case "tirReal":
      valor = pct(o.irr);
      break;
    case "sucio":
      valor = o.dirty;
      break;
    case "limpio":
      valor = o.clean;
      break;
    case "giro":
      valor = o.giro;
      break;
    case "rentVenta": {
      if (!ctx.venta) throw new Error("Falta la fecha y la tasa de venta.");
      const h = ctx.motor.holding(b, o, ctx.venta.fecha, ctx.venta.tasa / 100);
      if (esError(h)) throw new Error(h.error);
      valor = pct(h.tir);
      break;
    }
    case "carry":
    case "roe": {
      if (!ctx.fondeo) throw new Error("Falta configurar el fondeo.");
      const c = carryConConfig(posicionDesdeMotor(b, o), ctx.fondeo.config, ctx.fondeo.mercado);
      const h = c?.horizontes.find((x) => x.dias === ctx.fondeo!.horizonte);
      if (!h) throw new Error("El fondeo no tiene una tasa para calcular el carry.");
      valor = p.resultado === "carry" ? h.carry : pct(h.roe);
      break;
    }
  }
  return { entradas: e, b, o, valor };
}

/** Evalúa el resultado con la variable en x. */
export function evaluar(ctx: ContextoObjetivo, p: Problema, x: number): Evaluacion {
  let e = aplicar(p, x);
  if (p.variable === "precioCompra") e = e.tipo === "IBR" ? { ...e, precioDado: x } : compraParaPrecio(ctx.motor, e, x);
  return medir(ctx, p, e);
}

/* ---------- textos ---------- */
export const fmtValor = (v: number, u: "%" | "$", d = 3) => (u === "$" ? F.cop(v) : `${nf(d).format(v)} %`);

/** «IPC + 7,000 %», «una tasa de compra de 12,000 % E.A.», «un nominal de $ 1.000.000». */
export function describirVariable(v: ClaveVariable, t: TipoBono, x: number): string {
  switch (v) {
    case "spreadFacial":
      return `${t} + ${nf(3).format(x)} %`;
    case "spreadCompra":
      return `un spread de compra de ${t} + ${nf(3).format(x)} %`;
    case "tasaCompra":
      return `una tasa de compra de ${nf(3).format(x)} %${t === "UVR" ? " real" : " E.A."}`;
    case "tasaCupon":
      return `un cupón de ${nf(3).format(x)} %${t === "UVR" ? " real" : " E.A."}`;
    case "precioCompra":
      return `un precio de compra de ${nf(3).format(x)} %`;
    case "nominal":
      return `un nominal de ${F.cop(x)}`;
  }
}

export interface Respuesta {
  ok: true;
  x: number;
  raiz: Raiz;
  eval: Evaluacion;
  verificacion: string;
  flujos: Flujo[];
  /** Cambios para «Aplicar a la calculadora». */
  cambios: Partial<EntradasUI>;
}
export interface SinRespuesta {
  ok: false;
  mensaje: string;
}

/** Flujos de la respuesta, con su VP a la TIR que corresponde. */
export function flujosDe(p: Problema, ev: Evaluacion): Flujo[] {
  const { o, entradas } = ev;
  const compra = toN(String(p.entradas.valoracion));
  const xirr = p.resultado === "tirXirr";
  const fra = fraPrimero(p);
  const precio = fra ? 100 : o.dirty;
  const fl = flujosDesde(o, fra ? compra : toN(String(entradas.valoracion)), String(entradas.base), xirr);
  const y = solveYield(fl, precio, 0.1);
  return fl.map(({ r, t }) => filaFlujo(r, t, y, o.tipo));
}

function filaFlujo(r: FilaCronograma, t: number, y: number, tipo: TipoBono): Flujo {
  return {
    fecha: toS(r.pay),
    dias: r.D,
    indice: r.H != null ? pct(r.H) : tipo === "UVR" && r.infl != null ? pct(r.infl) : null,
    tasa: pct(r.tasa),
    cupon: r.K,
    amortizacion: r.amort,
    flujo: r.L,
    fuente: r.fuente,
    t,
    vp: r.L / Math.pow(1 + y, t),
  };
}

/** Resuelve el problema. */
export function buscarObjetivo(ctx: ContextoObjetivo, p: Problema): Respuesta | SinRespuesta {
  const t = p.entradas.tipo as TipoBono;
  const R = RESULTADOS[p.resultado],
    V = VARIABLES[p.variable];
  if (!R.tipos.includes(t)) return { ok: false, mensaje: `${R.nombre} no aplica a un título ${t}.` };
  if (!V.tipos.includes(t)) return { ok: false, mensaje: `${V.nombre} no aplica a un título ${t}.` };
  if (!Number.isFinite(p.objetivo)) return { ok: false, mensaje: "Escriba el valor objetivo." };
  if (p.aLaPar && p.variable === "precioCompra") return { ok: false, mensaje: "A la par el precio ya es 100: elija otra variable para cambiar." };
  if (R.requiere === "venta" && !ctx.venta) return { ok: false, mensaje: "Para la rentabilidad de la venta, indique la fecha y la tasa de venta." };
  if (R.requiere === "fondeo" && !ctx.fondeo) return { ok: false, mensaje: "Para el carry o el ROE, configure el fondeo en «Carry y fondeo»." };

  const [lo, hi] = V.rango(t);
  const actual = p.variable === "precioCompra" ? 100 : Number(p.entradas[campoDe(p.variable, t)]) || (lo + hi) / 2;
  const f = (x: number) => evaluar(ctx, p, x).valor - p.objetivo;
  // Nominal: el giro y el carry son proporcionales al nominal; se resuelve igual, en escala logarítmica.
  const sol = p.variable === "nominal" ? resolverNominal(f) : resolver(f, lo, hi, actual, TOLERANCIA);
  if (!sol.ok) {
    const nom = `${R.corto}`;
    if (sol.motivo === "constante") return { ok: false, mensaje: `${cap(nom)} no depende de ${V.nombre.toLowerCase()}: cambie otra variable.` };
    if (sol.motivo === "fallo") return { ok: false, mensaje: "El motor no pudo valorar el título con esas entradas. Revise las fechas y los datos." };
    const min = (sol.minimo ?? 0) + p.objetivo,
      max = (sol.maximo ?? 0) + p.objetivo;
    return {
      ok: false,
      mensaje: `No hay solución en un rango razonable: con ${V.nombre.toLowerCase()} entre ${fmtValor(lo, V.unidad, 0)} y ${fmtValor(hi, V.unidad, 0)}, ${nom} va de ${fmtValor(
        min,
        R.unidad,
      )} a ${fmtValor(max, R.unidad)} y nunca llega a ${fmtValor(p.objetivo, R.unidad)}. Pruebe con otro objetivo o cambie otra variable.`,
    };
  }
  const x = sol.raiz.x;
  const ev = evaluar(ctx, p, x);
  const verificacion = punto(`Con ${describirVariable(p.variable, t, x)}, ${R.corto} da ${fmtValor(ev.valor, R.unidad)}${R.sufijo}`);
  return { ok: true, x, raiz: sol.raiz, eval: ev, verificacion, flujos: flujosDe(p, ev), cambios: cambiosPara(p, ev, x) };
}

function resolverNominal(f: (x: number) => number) {
  // f es lineal en el nominal: se busca en log10(nominal) entre 0 y 14 y se refina en pesos.
  const s = resolver((u) => f(Math.pow(10, u)), 0, 14, 9, 1e-12);
  return s.ok ? { ...s, raiz: { ...s.raiz, x: Math.pow(10, s.raiz.x) } } : s;
}

/** Campos que se copian a la calculadora con «Aplicar». */
function cambiosPara(p: Problema, ev: Evaluacion, x: number): Partial<EntradasUI> {
  const t = p.entradas.tipo as TipoBono;
  const e = ev.entradas;
  const c: Partial<EntradasUI> = {};
  const campos = new Set<string>([campoDe(p.variable, t)]);
  if (esUsoPar(p)) ["emision", "spread", "spreadCompra", "cupon", "tasaCompra", "precioDado"].forEach((k) => campos.add(k));
  for (const k of campos) if (k in e && (k !== "precioDado" || t === "IBR")) c[k] = typeof e[k] === "number" ? redondear(e[k] as number) : e[k];
  if (p.variable === "nominal") c.nominal = Math.round(x);
  // «Primer periodo con la FRA» valora un día antes: la calculadora conserva la fecha de compra.
  if (fraPrimero(p)) c.valoracion = String(p.entradas.valoracion);
  return c;
}

const redondear = (v: number) => +v.toFixed(8);
const punto = (s: string) => (s.endsWith(".") ? s : s + ".");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
