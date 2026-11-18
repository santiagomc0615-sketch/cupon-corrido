/* Herramientas del asesor (tool use). Cada una llama al motor (lib/engine), a lib/carry o a la vista
   cliente y devuelve cifras YA calculadas y formateadas (es-CO), con fuente y fecha. El modelo no
   calcula: solo elige la herramienta, lee el resultado y lo explica.
   Funciones puras sobre un contexto (motor + datos del día + portafolio del usuario). */
import { herramientasAnthropic } from "@/lib/ia/herramientas";
import type { DefinicionHerramienta } from "@/lib/ia/tipos";
import { z } from "zod";
import { carryConConfig, carryPortafolioFondeo, comparacion, CONFIG_INICIAL, type ConfigFondeo } from "@/lib/carry/config";
import { NOMBRE_ALTERNATIVA } from "@/lib/carry/exterior";
import { NOMBRE_FONDEO, type TipoFondeo } from "@/lib/carry/fondeo";
import { mercadoFondeo } from "@/lib/carry/mercado-snap";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { tasaPeriodo } from "@/lib/carry/tasas";
import { crearDefaults, toEngine, type EntradasUI } from "@/lib/calculadora";
import { resumenPortafolio, resumenTitulo } from "@/lib/cliente";
import type { SnapshotMercado } from "@/lib/data/mercado";
import { escenarioPortafolio, SUPUESTOS_INICIALES } from "@/lib/escenarios";
import { esError, pfMetrics, pvAt, tirInterpolada, toN, toS, type Bono, type Motor, type ResultadoValoracion, type TipoBono } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import { spreadTesUst } from "@/lib/global";
import type { ParametrosTributarios } from "@/lib/impuestos/parametros";
import type { PerfilContribuyente } from "@/lib/impuestos/perfil";
import { derivarMercado } from "@/lib/mercado-derivado";
import type { DatosUVR } from "@/lib/analisis/inflacion-implicita";
import { ejecutarAnalisis, ENTRADAS_ANALISIS, HERRAMIENTAS_ANALISIS } from "./herramientas-analisis";
import { ENTRADAS_IMPUESTOS, herramientaImpuestos, herramientaPyG, HERRAMIENTAS_IMPUESTOS } from "./herramientas-impuestos";

export interface PosicionAgente {
  titulo: string;
  b: Bono;
  o: ResultadoValoracion;
}

export interface ContextoHerramientas {
  motor: Motor;
  snap: SnapshotMercado;
  /** Fecha de análisis (AAAA-MM-DD). */
  fecha: string;
  /** Portafolio del usuario ya valorado por el motor. */
  portafolio: PosicionAgente[];
  /** Título que está en la calculadora, si lo hay. */
  titulo: PosicionAgente | null;
  /** Fondeo configurado por el usuario (null: el inicial). */
  fondeo: ConfigFondeo | null;
  /** Perfil y parámetros tributarios del usuario (si no, los oficiales y persona natural no obligada). */
  tributario?: { perfil: PerfilContribuyente; params: ParametrosTributarios };
  /** TIR de TES UVR que cargó el usuario (inflación implícita); si no, la curva UVR del servidor. */
  uvr?: DatosUVR | null;
}

/* ---------- utilidades ---------- */
const pct = (x: number, d = 2) => F.pct(x, d);
const mill = (x: number, d = 1) => F.mill(x, d);
const pb = (x: number) => nf(1).format(x) + " pb";
const sumarAnios = (fecha: string, anios: number) => toS(toN(fecha) + Math.round(anios * 365.25));

const TIPOS = ["TF", "IBR", "IPC", "UVR"] as const;
const NOMBRE_TIPO: Record<TipoBono, string> = { TF: "TES / bono tasa fija", IBR: "Bono IBR", IPC: "Bono IPC", UVR: "TES UVR" };


/** Ficha de un título valorado (todas las cifras del motor y de la vista cliente). */
function fichaTitulo(p: PosicionAgente) {
  const { b, o } = p;
  const r = resumenTitulo(b, o);
  const spread = o.tipo === "TF" ? o.spreadCurve : o.tipo === "UVR" ? o.spreadUVR : null;
  return {
    titulo: p.titulo,
    tipo: NOMBRE_TIPO[b.tipo],
    valoracion: b.valoracion,
    emision: b.emision,
    vencimiento: b.vencimiento,
    nominal: F.cop(b.nominal) + (b.tipo === "UVR" ? " UVR" : ""),
    precio_sucio: F.n(o.dirty, 3) + " %",
    precio_limpio: F.n(o.clean, 3) + " %",
    cupon_corrido: F.n(o.accrued, 4) + " %",
    tir: pct(o.irr, 3) + (b.tipo === "UVR" ? " real" : " E.A."),
    tir_en_pesos: pct(o.yieldCOP, 3) + " E.A.",
    valor_giro: F.cop(o.giro),
    duracion_modificada: F.n(o.mod, 3),
    duracion_macaulay_anios: F.n(o.mac, 3),
    dv01: F.cop(o.dv01),
    convexidad: F.n(o.conv, 2),
    spread_vs_curva_tes: spread != null ? pb(spread) : "no aplica",
    ganancia_anual_estimada: mill(r.gananciaAnual),
    ganancia_diaria: F.cop(r.gananciaDiaria),
    proximo_cupon: r.proximo ? `${F.date(r.proximo.fecha)}: ${F.n(r.proximo.pct, 3)} % · ${mill(r.proximo.cop)}` : "sin cupones pendientes",
    total_a_recibir_hasta_vencimiento: mill(r.totalPagos),
    colchon: `${nf(0).format(r.colchonPb)} pb (las tasas pueden subir eso en un año antes de perder)`,
    sensibilidad: o.sens
      .filter((x) => [-200, -100, 100, 200].includes(x.bp))
      .map((x) => ({ cambio_tasa: (x.bp > 0 ? "+" : "") + x.bp + " pb", precio_real: F.n(x.real, 3) + " %", aprox_solo_duracion: F.n(x.eD, 3) + " %", aprox_duracion_y_convexidad: F.n(x.eDC, 3) + " %", cambio_valor: F.copM(x.dVal) })),
  };
}

/* ---------- esquemas de entrada (validados antes de ejecutar) ---------- */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ENTRADAS = {
  valorar_titulo: z.object({
    usar_titulo_calculadora: z.boolean().optional(),
    tipo: z.enum(TIPOS).optional(),
    nominal: z.number().positive().optional(),
    emision: fecha.optional(),
    vencimiento: fecha.optional(),
    cupon_o_spread_facial_pct: z.number().min(-5).max(50).optional(),
    tasa_compra_pct: z.number().min(-5).max(60).optional(),
    frecuencia: z.enum(["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"]).optional(),
  }),
  simular_escenario_tasas: z.object({
    escenario: z.enum(["paralelo", "empinamiento", "recorte_banrep"]),
    pb: z.number().min(-1000).max(1000),
    sobre: z.enum(["portafolio", "titulo_calculadora"]).optional(),
  }),
  comparar_opciones: z.object({
    plazo_anios: z.number().min(0.5).max(30),
    monto: z.number().positive().optional(),
    spread_ibr_pct: z.number().min(-5).max(20).optional(),
    spread_ipc_pct: z.number().min(-5).max(20).optional(),
    tir_real_uvr_pct: z.number().min(-5).max(20).optional(),
    tasa_cdt_pct: z.number().min(0).max(60).optional(),
  }),
  analizar_fondeo: z.object({
    sobre: z.enum(["portafolio", "titulo_calculadora"]).optional(),
    tipo_fondeo: z.enum(["propio", "repo", "ibr", "credito", "exterior"]).optional(),
    tasa_pct: z.number().min(0).max(60).optional(),
    haircut_pct: z.number().min(0).max(100).optional(),
  }),
  resumen_portafolio: z.object({}),
  datos_mercado: z.object({}),
  ...ENTRADAS_IMPUESTOS,
  ...ENTRADAS_ANALISIS,
} as const;

export type NombreHerramienta = keyof typeof ENTRADAS;

/* ---------- definiciones para la API ---------- */
const objeto = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

/** Definiciones únicas (JSON Schema). lib/ia/herramientas.ts las traduce a cada proveedor. */
export const DEFINICIONES_HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    name: "valorar_titulo",
    description:
      "Valora un título de renta fija colombiano con el motor de la calculadora (validado contra el Excel del curso): precio sucio y limpio, TIR, TIR en pesos, duración, DV01, convexidad, spread contra la curva TES, ganancia anual, próximo cupón, total a recibir y colchón en pb. Úsala para cualquier cifra de un título. Con usar_titulo_calculadora=true valora el título que el usuario tiene abierto en la calculadora; si no, arma uno con los campos dados (los que falten toman los del ejemplo de la calculadora para ese tipo).",
    input_schema: objeto({
      usar_titulo_calculadora: { type: "boolean", description: "true para valorar el título abierto en la calculadora." },
      tipo: { type: "string", enum: TIPOS, description: "TF (tasa fija), IBR, IPC o UVR." },
      nominal: { type: "number", description: "Valor nominal en pesos (en UVR para títulos UVR)." },
      emision: { type: "string", description: "Fecha de emisión AAAA-MM-DD." },
      vencimiento: { type: "string", description: "Fecha de vencimiento AAAA-MM-DD." },
      cupon_o_spread_facial_pct: { type: "number", description: "TF/UVR: cupón facial en % (13.85). IBR/IPC: spread facial sobre el índice en %." },
      tasa_compra_pct: { type: "number", description: "TF: TIR de compra E.A. en %. UVR: TIR real en %. IBR/IPC: spread de compra sobre el índice en %." },
      frecuencia: { type: "string", enum: ["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"] },
    }),
  },
  {
    name: "simular_escenario_tasas",
    description:
      "Revalora el portafolio (o el título de la calculadora) ante un movimiento de tasas y devuelve el cambio de valor en pesos y en % por posición y total. Escenarios: paralelo (toda la curva se mueve pb), empinamiento (0 pb hasta 2 años de duración, pb completos desde 10 años, lineal entre ambos; positivo = la parte larga sube más) y recorte_banrep (la tasa de política baja |pb|; traspaso a la curva TES 80 % en el corto y 30 % en el largo, 100 % al IBR; IBR recalculado con el motor).",
    input_schema: objeto(
      {
        escenario: { type: "string", enum: ["paralelo", "empinamiento", "recorte_banrep"] },
        pb: { type: "number", description: "Puntos básicos. Paralelo/empinamiento: positivo = las tasas suben. recorte_banrep: tamaño del recorte (se usa |pb|)." },
        sobre: { type: "string", enum: ["portafolio", "titulo_calculadora"], description: "Por defecto, el portafolio." },
      },
      ["escenario", "pb"],
    ),
  },
  {
    name: "comparar_opciones",
    description:
      "Compara, para un plazo y monto, invertir en TES tasa fija (TIR de la curva TES a ese plazo), bono IBR, bono IPC, TES UVR y un CDT (tasa dada o la DTF del día). Valora cada opción con el motor y devuelve TIR en pesos, duración, DV01, ganancia anual estimada, total a recibir y a qué riesgo queda expuesta. Los spreads de IBR/IPC y la TIR real UVR que no se den son supuestos del ejemplo de la calculadora y se marcan como tales.",
    input_schema: objeto(
      {
        plazo_anios: { type: "number", description: "Plazo de la inversión en años (0,5 a 30)." },
        monto: { type: "number", description: "Monto a invertir en pesos. Por defecto 1.000 millones." },
        spread_ibr_pct: { type: "number", description: "Spread sobre IBR en %." },
        spread_ipc_pct: { type: "number", description: "Spread sobre IPC en %." },
        tir_real_uvr_pct: { type: "number", description: "TIR real del TES UVR en %." },
        tasa_cdt_pct: { type: "number", description: "Tasa del CDT E.A. en %. Por defecto la DTF del día." },
      },
      ["plazo_anios"],
    ),
  },
  {
    name: "analizar_fondeo",
    description:
      "Carry y fondeo con lib/carry: causación diaria, costo del fondeo, carry neto diario y a 30/90/365 días, ROE sobre capital propio y colchón en pb; además la comparación de fondearse en pesos vs. en dólares sin cubrir vs. cubierto (SOFR, TRM e IBR del día). Por defecto usa el fondeo que el usuario configuró en la calculadora; los campos dados lo cambian solo para este cálculo.",
    input_schema: objeto({
      sobre: { type: "string", enum: ["portafolio", "titulo_calculadora"], description: "Por defecto, el título de la calculadora si hay; si no, el portafolio." },
      tipo_fondeo: { type: "string", enum: ["propio", "repo", "ibr", "credito", "exterior"] },
      tasa_pct: { type: "number", description: "Tasa del fondeo E.A. en % (si no, la del día: TPM para repo, IBR para interbancario)." },
      haircut_pct: { type: "number", description: "Porcentaje no fondeado (capital propio), en %." },
    }),
  },
  {
    name: "resumen_portafolio",
    description:
      "Resumen del portafolio del usuario con el motor: valor, TIR promedio en pesos, duración, DV01, convexidad, composición por tipo, ganancia anual estimada, colchón, pruebas de estrés (±50/100/200 pb, empinamiento, aplanamiento) y cada posición con su TIR, duración y spread.",
    input_schema: objeto({}),
  },
  {
    name: "datos_mercado",
    description:
      "Datos de mercado del día con fuente y fecha: tasa de política, inflación (12 meses, núcleo, expectativas), IBR por plazo, UVR, curva TES (referencias), TRM, SOFR, Tesoro de EE. UU. a 10 años, spread TES 10A − UST 10A y DTF.",
    input_schema: objeto({}),
  },
  ...HERRAMIENTAS_IMPUESTOS,
  ...HERRAMIENTAS_ANALISIS,
];

/** Formato de Anthropic (tool use con streaming de la entrada). */
export const HERRAMIENTAS = herramientasAnthropic(DEFINICIONES_HERRAMIENTAS);

/* ---------- ejecución ---------- */
function valorar(ctx: ContextoHerramientas, b: Bono, titulo: string): PosicionAgente | { error: string } {
  const o = ctx.motor.price(b);
  return esError(o) ? { error: o.error } : { titulo, b, o };
}

function herramientaValorar(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS.valorar_titulo>) {
  if (i.usar_titulo_calculadora || (!i.tipo && ctx.titulo)) {
    if (!ctx.titulo) return { error: "No hay un título válido abierto en la calculadora." };
    return fichaTitulo(ctx.titulo);
  }
  const tipo = i.tipo ?? "TF";
  const base: EntradasUI = { ...crearDefaults(ctx.fecha)[tipo] };
  if (i.nominal) base.nominal = i.nominal;
  if (i.emision) base.emision = i.emision;
  if (i.vencimiento) base.vencimiento = i.vencimiento;
  if (i.frecuencia) base.frecuencia = i.frecuencia;
  if (i.cupon_o_spread_facial_pct != null) base[tipo === "TF" || tipo === "UVR" ? "cupon" : "spread"] = i.cupon_o_spread_facial_pct;
  if (i.tasa_compra_pct != null) {
    if (tipo === "TF" || tipo === "UVR") base.tasaCompra = i.tasa_compra_pct;
    else base.spreadCompra = i.tasa_compra_pct;
  }
  base.valoracion = ctx.fecha;
  const v = valorar(ctx, toEngine(base), `${NOMBRE_TIPO[tipo]} ${base.vencimiento}`);
  return "error" in v ? v : { ...fichaTitulo(v), supuestos: "Campos no dados: los del ejemplo de la calculadora." };
}

function posicionesDe(ctx: ContextoHerramientas, sobre?: string): PosicionAgente[] | { error: string } {
  if (sobre === "titulo_calculadora") return ctx.titulo ? [ctx.titulo] : { error: "No hay un título válido abierto en la calculadora." };
  return ctx.portafolio.length ? ctx.portafolio : { error: "El portafolio está vacío." };
}

function herramientaEscenario(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS.simular_escenario_tasas>) {
  const V = posicionesDe(ctx, i.sobre);
  if ("error" in V) return V;
  const valor0 = V.reduce((s, x) => s + x.o.giro, 0);
  let filas: { titulo: string; delta: number; valor: number; cambio_tasa: string }[];
  let supuestos: string;
  if (i.escenario === "recorte_banrep") {
    const pbs = -Math.abs(i.pb);
    const r = escenarioPortafolio(ctx.snap.datos, V.map((x) => ({ p: x.titulo, b: x.b, o: x.o })), ctx.fecha, { ...SUPUESTOS_INICIALES, pb: pbs });
    filas = r.filas.map((f) => ({ titulo: f.p, delta: f.delta, valor: f.valor0, cambio_tasa: pb(f.deltaPb) }));
    supuestos = `Recorte de ${Math.abs(pbs)} pb en la tasa de política (de ${pct(ctx.snap.macro.tpm)} a ${pct(ctx.snap.macro.tpm + pbs / 1e4)}); traspaso a la curva TES 80 % en el corto plazo y 30 % en el largo; IBR −${Math.abs(pbs)} pb.`;
  } else {
    const dy = (mac: number) => (i.escenario === "paralelo" ? i.pb : i.pb * Math.min(1, Math.max(0, (mac - 2) / 8))) / 1e4;
    filas = V.map((x) => {
      const d = dy(x.o.mac);
      const delta = ((pvAt(x.o.flows, x.o.irr + d) - pvAt(x.o.flows, x.o.irr)) / 100) * x.b.nominal * x.o.fx;
      return { titulo: x.titulo, delta, valor: x.o.giro, cambio_tasa: pb(d * 1e4) };
    });
    supuestos =
      i.escenario === "paralelo"
        ? `Toda la curva se mueve ${pb(i.pb)}; revaloración completa de cada título a su TIR + Δ.`
        : `Empinamiento: 0 pb hasta 2 años de duración y ${pb(i.pb)} desde 10 años, lineal entre ambos.`;
  }
  const total = filas.reduce((s, f) => s + f.delta, 0);
  return {
    escenario: i.escenario,
    supuestos,
    posiciones: filas.map((f) => ({ titulo: f.titulo, cambio_tasa: f.cambio_tasa, cambio_valor: mill(f.delta), cambio_pct: pct(f.valor ? f.delta / f.valor : 0) })),
    total: { valor_hoy: mill(valor0), cambio_valor: mill(total), cambio_pct: pct(valor0 ? total / valor0 : 0) },
  };
}

function herramientaComparar(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS.comparar_opciones>) {
  const monto = i.monto ?? 1e9;
  const venc = sumarAnios(ctx.fecha, i.plazo_anios);
  const def = crearDefaults(ctx.fecha);
  const mk = derivarMercado(ctx.motor, ctx.snap);
  const tirTF = tirInterpolada(mk.tesSorted.map((r) => [r[4], r[3]] as [number, number]), i.plazo_anios);
  const comun = { emision: ctx.fecha, vencimiento: venc, valoracion: ctx.fecha };
  const uvrHoy = mk.uvrHoy.v;
  const entradas: [TipoBono, EntradasUI, string][] = [
    ["TF", { ...def.TF, ...comun, nominal: monto, cupon: +(tirTF * 100).toFixed(4), tasaCompra: +(tirTF * 100).toFixed(4) }, `TIR de la curva TES a ${nf(1).format(i.plazo_anios)} años (${F.date(ctx.snap.datos.curveDate)})`],
    ["IBR", { ...def.IBR, ...comun, nominal: monto, spread: i.spread_ibr_pct ?? Number(def.IBR.spread), spreadCompra: i.spread_ibr_pct ?? Number(def.IBR.spreadCompra) }, i.spread_ibr_pct != null ? "spread dado" : "supuesto: spread del ejemplo de la calculadora"],
    ["IPC", { ...def.IPC, ...comun, nominal: monto, spread: i.spread_ipc_pct ?? Number(def.IPC.spread), spreadCompra: i.spread_ipc_pct ?? Number(def.IPC.spreadCompra) }, i.spread_ipc_pct != null ? "spread dado" : "supuesto: spread del ejemplo de la calculadora"],
    ["UVR", { ...def.UVR, ...comun, nominal: monto / uvrHoy, cupon: i.tir_real_uvr_pct ?? Number(def.UVR.tasaCompra), tasaCompra: i.tir_real_uvr_pct ?? Number(def.UVR.tasaCompra) }, i.tir_real_uvr_pct != null ? "TIR real dada" : "supuesto: TIR real del ejemplo de la calculadora"],
  ];
  const RIESGO: Record<TipoBono, string> = {
    TF: "Tasa: pierde si las tasas suben; gana si bajan.",
    IBR: "Poco riesgo de tasa (el cupón se ajusta con el IBR); el ingreso baja si el BanRep recorta.",
    IPC: "Protege contra la inflación; riesgo de tasa real.",
    UVR: "Protege contra la inflación (capital indexado a la UVR); riesgo de tasa real.",
  };
  const opciones: Record<string, unknown>[] = entradas.map(([t, e, nota]) => {
    const v = valorar(ctx, toEngine(e), NOMBRE_TIPO[t]);
    if ("error" in v) return { opcion: NOMBRE_TIPO[t], error: v.error };
    const f = fichaTitulo(v);
    return {
      opcion: NOMBRE_TIPO[t],
      tasa_usada: nota,
      tir_en_pesos: f.tir_en_pesos,
      duracion_modificada: f.duracion_modificada,
      dv01: f.dv01,
      ganancia_anual_estimada: f.ganancia_anual_estimada,
      total_a_recibir: f.total_a_recibir_hasta_vencimiento,
      riesgo: RIESGO[t],
    };
  });
  const tCDT = i.tasa_cdt_pct != null ? i.tasa_cdt_pct / 100 : (ctx.snap.dtf?.valor ?? null);
  opciones.push(
    tCDT == null
      ? { opcion: "CDT", error: "Sin DTF del día: indique tasa_cdt_pct." }
      : {
          opcion: "CDT",
          tasa_usada: i.tasa_cdt_pct != null ? `${pct(tCDT)} E.A. dada` : `DTF ${pct(tCDT)} E.A. (BanRep · ${ctx.snap.dtf?.fecha ? F.date(ctx.snap.dtf.fecha) : "—"}; referencia de CDT a 90 días)`,
          tir_en_pesos: pct(tCDT, 3) + " E.A.",
          ganancia_anual_estimada: mill(monto * tasaPeriodo(tCDT, 365)),
          total_a_recibir: mill(monto * (1 + tasaPeriodo(tCDT, i.plazo_anios * 365))),
          riesgo: "Sin riesgo de precio si se mantiene al vencimiento; riesgo de reinversión y del emisor (seguro de depósitos hasta el tope de Fogafín).",
        },
  );
  return { plazo: `${nf(1).format(i.plazo_anios)} años (vence ${F.date(venc)})`, monto: mill(monto), opciones };
}

function herramientaFondeo(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS.analizar_fondeo>) {
  const sobre = i.sobre ?? (ctx.titulo ? "titulo_calculadora" : "portafolio");
  const V = posicionesDe(ctx, sobre);
  if ("error" in V) return V;
  const base = ctx.fondeo ?? CONFIG_INICIAL;
  const c: ConfigFondeo = {
    ...base,
    ...(i.tipo_fondeo ? { tipo: i.tipo_fondeo as TipoFondeo } : {}),
    ...(i.tasa_pct != null ? { tasa: i.tasa_pct / 100, modalidad: "EA" as const } : {}),
    ...(i.haircut_pct != null ? { haircut: i.haircut_pct / 100 } : {}),
  };
  const m = mercadoFondeo(ctx.snap);
  const posiciones = V.map((x) => posicionDesdeMotor(x.b, x.o));
  const t = carryPortafolioFondeo(posiciones, c, m);
  const unico = V.length === 1 ? carryConConfig(posiciones[0], c, m) : null;
  if (!t) return { error: "Falta un dato para el fondeo (tasa del crédito, TPM, IBR o SOFR)." };
  const cmp = comparacion(c, m, t.fondeado);
  return {
    sobre: sobre === "titulo_calculadora" ? V[0].titulo : `portafolio de ${V.length} títulos`,
    fondeo: `${NOMBRE_FONDEO[c.tipo]} a ${pct(t.tasaEA, 3)} E.A., haircut ${pct(c.haircut, 0)}`,
    valor_giro: mill(t.giro),
    monto_fondeado: `${mill(t.fondeado)} (${pct(t.pctFondeado, 0)})`,
    capital_propio: mill(t.capital),
    causacion_diaria: F.mill(t.causacionDia, 4),
    costo_fondeo_diario: F.mill(t.costoDia, 4),
    carry_neto_diario: F.mill(t.carryDia, 4),
    horizontes: t.horizontes.map((h) => ({ dias: h.dias, carry: mill(h.carry), roe: pct(h.roe), roe_ea: pct(h.roeEA), colchon: pb(h.colchonPb) })),
    ...(unico ? { causacion_diaria_pct_del_giro: pct(unico.causacionDia.pct, 4) } : {}),
    comparacion_exterior: cmp
      ? {
          tasa_usd_sofr_mas_spread: pct(cmp.tasaUSD, 3) + " E.A.",
          devaluacion_implicita_forward: pct(cmp.devForward) + " E.A.",
          devaluacion_equilibrio: pct(cmp.devEquilibrio),
          alternativas: cmp.filas.map((f) => ({ alternativa: NOMBRE_ALTERNATIVA[f.alternativa], costo_ea_en_pesos: pct(f.tasaEA, 3), costo_anual: mill(f.costoAnual) })),
          mas_barata: NOMBRE_ALTERNATIVA[cmp.masBarata],
          nota_devaluacion: c.exterior.devEsperada == null ? "Sin devaluación esperada propia se usa la implícita del forward: sin cubrir y cubierto cuestan lo mismo." : `Devaluación esperada del usuario: ${pct(c.exterior.devEsperada)}.`,
          fuentes: `SOFR ${m.sofrFecha ? F.date(m.sofrFecha) : "—"} (Fed NY), TRM ${m.spotFecha ? F.date(m.spotFecha) : "—"} (datos.gov.co), IBR ${m.ibr ? F.date(m.ibr.fecha) : "—"} (BanRep)`,
        }
      : "Sin SOFR o TRM del día para comparar con el exterior.",
  };
}

function herramientaPortafolio(ctx: ContextoHerramientas) {
  const V = ctx.portafolio;
  if (!V.length) return { error: "El portafolio está vacío." };
  const m = pfMetrics(V.map((x) => ({ p: x.titulo, b: x.b, o: x.o })));
  const r = resumenPortafolio(V)!;
  const z0 = ctx.motor.spot;
  return {
    valor: mill(m.mv),
    tir_promedio_en_pesos: pct(m.ytm, 3) + " E.A.",
    duracion_modificada: F.n(m.mod, 3),
    duracion_macaulay_anios: F.n(m.mac, 3),
    dv01: F.cop(m.dv01),
    convexidad: F.n(m.conv, 2),
    ganancia_anual_estimada: mill(r.gananciaAnual),
    colchon: `${nf(0).format(r.colchonPb)} pb`,
    composicion: (Object.entries(m.byType) as [TipoBono, number][]).map(([t, v]) => ({ tipo: NOMBRE_TIPO[t], peso: pct(v / m.mv, 1), valor: mill(v) })),
    estres: m.stress.map(([e, d]) => ({ escenario: e, cambio_valor: mill(d), cambio_pct: pct(d / m.mv) })),
    posiciones: V.map((x) => ({
      titulo: x.titulo,
      tipo: NOMBRE_TIPO[x.b.tipo],
      vencimiento: x.b.vencimiento,
      tir_en_pesos: pct(x.o.yieldCOP, 3),
      duracion_modificada: F.n(x.o.mod, 3),
      peso: pct(x.o.giro / m.mv, 1),
      spread_vs_curva_cero_pb: pb((x.o.yieldCOP - z0(x.o.mac)) * 1e4),
    })),
  };
}

function herramientaMercado(ctx: ContextoHerramientas) {
  const { snap } = ctx;
  const mk = derivarMercado(ctx.motor, snap);
  const f = (k: keyof typeof snap.fuentes) => snap.fuentes[k];
  const ibr = mk.ibrLast.d;
  const spread = snap.ust10Curva ? spreadTesUst({ nombre: mk.tes10[0], tir: mk.tes10[3], plazo: mk.tes10[4] }, snap.ust10Curva, snap.datos.curveDate) : null;
  return {
    fecha_analisis: snap.fechaAnalisis,
    tasa_politica: { valor: pct(snap.macro.tpm), fecha: snap.macro.tpmFecha, fuente: snap.macro.tpmFuente, ultima_decision: `${F.date(snap.macro.decisionFecha)}: ${snap.macro.decision}` },
    inflacion_12m: { valor: pct(mk.ipcLast.annual), mes: F.mes(mk.ipcLast.f), fuente: f("ipc")?.fuente ?? "DANE" },
    inflacion_nucleo: pct(snap.macro.nucleo, 1),
    expectativas_inflacion: {
      fuente: snap.fuentes.exp?.fuente ?? "Encuesta del BanRep",
      trayectoria: snap.datos.exp.filter((_, k, a) => k === 0 || k === a.length - 1 || k % 3 === 0).map(([f, v]) => ({ mes: F.mes(f), inflacion_anual_esperada: pct(v) })),
      a_2_anios: pct(snap.macro.exp2y),
    },
    tasa_real_ex_post: pct(mk.realRate),
    ibr: { fecha: mk.ibrLast.f, fuente: f("ibr")?.fuente, overnight: nf(3).format(ibr[1]) + " % N.A.", "1m": nf(3).format(ibr[2]) + " %", "3m": nf(3).format(ibr[3]) + " %", "6m": nf(3).format(ibr[4]) + " %", "12m": nf(3).format(ibr[5]) + " %" },
    uvr: { valor: nf(4).format(mk.uvrHoy.v), fecha: mk.uvrHoy.f, fuente: f("uvr")?.fuente },
    curva_tes: { fecha: snap.datos.curveDate, fuente: f("tes")?.fuente, referencias: mk.tesSorted.map((r) => ({ titulo: r[0], plazo_anios: nf(2).format(r[4]), tir: pct(r[3], 3) })) },
    trm: snap.trm
      ? {
          valor: nf(2).format(snap.trm.valor),
          fecha: snap.trm.fecha,
          fuente: "datos.gov.co · Superfinanciera",
          ...(snap.trm.hace12m ? { devaluacion_12_meses: pct(snap.trm.valor / snap.trm.hace12m.valor - 1), trm_hace_12_meses: `${nf(2).format(snap.trm.hace12m.valor)} (${snap.trm.hace12m.fecha})` } : {}),
        }
      : "sin dato",
    sofr: snap.sofr ? { valor: pct(snap.sofr.valor), fecha: snap.sofr.fecha, fuente: "Fed de Nueva York" } : "sin dato",
    ust_10a: snap.ust10 ? { valor: pct(snap.ust10.valor), fecha: snap.ust10.fecha, fuente: "Tesoro de EE. UU." } : "sin dato",
    spread_tes10_ust10: spread ? { valor: pb(spread.pb), fecha_curva: spread.fecha } : "sin dato",
    dtf: snap.dtf ? { valor: pct(snap.dtf.valor), fecha: snap.dtf.fecha, fuente: "BanRep" } : "sin dato",
  };
}

/** Ejecuta una herramienta: valida la entrada y devuelve el resultado en JSON (o un error). */
export function ejecutarHerramienta(nombre: string, entrada: unknown, ctx: ContextoHerramientas): { contenido: string; error: boolean } {
  if (!(nombre in ENTRADAS)) return { contenido: JSON.stringify({ error: `Herramienta desconocida: ${nombre}` }), error: true };
  const n = nombre as NombreHerramienta;
  const v = ENTRADAS[n].safeParse(entrada ?? {});
  if (!v.success) return { contenido: JSON.stringify({ error: "Entrada inválida", detalle: v.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`) }), error: true };
  try {
    const r =
      n === "valorar_titulo"
        ? herramientaValorar(ctx, v.data as z.infer<typeof ENTRADAS.valorar_titulo>)
        : n === "simular_escenario_tasas"
          ? herramientaEscenario(ctx, v.data as z.infer<typeof ENTRADAS.simular_escenario_tasas>)
          : n === "comparar_opciones"
            ? herramientaComparar(ctx, v.data as z.infer<typeof ENTRADAS.comparar_opciones>)
            : n === "analizar_fondeo"
              ? herramientaFondeo(ctx, v.data as z.infer<typeof ENTRADAS.analizar_fondeo>)
              : n === "resumen_portafolio"
                ? herramientaPortafolio(ctx)
                : n === "calcular_impuestos"
                  ? herramientaImpuestos(ctx, v.data as z.infer<typeof ENTRADAS.calcular_impuestos>)
                  : n === "calcular_pyg"
                    ? herramientaPyG(ctx, v.data as z.infer<typeof ENTRADAS.calcular_pyg>)
                    : n in ENTRADAS_ANALISIS
                      ? ejecutarAnalisis(n as keyof typeof ENTRADAS_ANALISIS, v.data, ctx)
                      : herramientaMercado(ctx);
    return { contenido: JSON.stringify(r), error: "error" in (r as object) };
  } catch (e) {
    return { contenido: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), error: true };
  }
}

export { ETIQUETA_HERRAMIENTA } from "./etiquetas";
