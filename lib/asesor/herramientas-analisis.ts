/* Herramientas del asesor para el resto de funciones de la calculadora: curva TES, inflación implícita,
   retorno esperado con roll-down, análisis del título (liquidez, valorización, atribución, spreads),
   simular venta, flujos y el comparador CDT vs. TES con impuestos y escenarios. Cada una llama al
   mismo código que usa la página (lib/analisis, lib/pyg, motor); el modelo no calcula. */
import { z } from "zod";
import { atribucionDesdeCompra } from "@/lib/analisis/atribucion";
import { nombreTasa, tasaDe, tasaVentaDe } from "@/lib/analisis/comunes";
import { inflacionImplicita, lecturaImplicita, META_INFLACION, TEXTO_SENAL, UMBRAL_PB, type DatosUVR } from "@/lib/analisis/inflacion-implicita";
import { esReferenciaTES, semaforoLiquidez } from "@/lib/analisis/liquidez";
import { curvaPara, HORIZONTES_DIAS, retornoEsperado, sumarRetornos, type CurvaRef } from "@/lib/analisis/retorno-esperado";
import { spreadActual } from "@/lib/analisis/spreads";
import { potencialValorizacion } from "@/lib/analisis/valorizacion";
import { mercadoFondeo } from "@/lib/carry/mercado-snap";
import { esError, holding, pfMetrics, toS } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import { conOficiales } from "@/lib/impuestos/parametros";
import { NOMBRE_CONTRIBUYENTE, PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import { compararOpciones, escenariosComparador, NOMBRE_OPCION, RIESGO } from "@/lib/pyg/comparador";
import { costoFondeo } from "@/lib/pyg/desde-motor";
import { textoRent } from "@/lib/pyg/estado";
import type { ContextoHerramientas, PosicionAgente } from "./herramientas";

const pct = (x: number, d = 2) => F.pct(x, d);
const mill = (x: number) => F.mill(x, 1);
const pb = (x: number) => nf(1).format(x) + " pb";
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sobre = z.enum(["titulo_calculadora", "portafolio"]);

export const ENTRADAS_ANALISIS = {
  curva_tes: z.object({}),
  inflacion_implicita: z.object({}),
  retorno_esperado: z.object({ sobre: sobre.optional() }),
  analisis_titulo: z.object({
    tasa_objetivo_pct: z.number().min(-5).max(60).optional(),
    monto_emitido: z.number().min(0).max(1e15).optional(),
    fecha_compra: fecha.optional(),
    tasa_compra_original_pct: z.number().min(-5).max(60).optional(),
  }),
  simular_venta: z.object({ fecha_venta: fecha, tasa_venta_pct: z.number().min(-5).max(60).optional() }),
  flujos: z.object({ sobre: sobre.optional() }),
  comparador_cdt_tes: z.object({
    monto: z.number().positive().max(1e14).optional(),
    plazo_anios: z.number().min(0.5).max(20),
    tasa_cdt_pct: z.number().min(0).max(60).optional(),
  }),
} as const;

const objeto = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });
const propSobre = { type: "string", enum: sobre.options, description: "Por defecto el título de la calculadora si hay; si no, el portafolio." };

export const HERRAMIENTAS_ANALISIS = [
  {
    name: "curva_tes",
    description:
      "Curva TES del día con el motor: tasas cero cupón (spot) a 1, 2, 3, 5, 7, 10 y 15 años, forwards a 1 año implícitos, forma de la curva (pendiente 10A − 1A), prima del spot a 1 año sobre la tasa de política y las referencias TES con su TIR, con fecha y fuente.",
    input_schema: objeto({}),
  },
  {
    name: "inflacion_implicita",
    description:
      "Inflación implícita por cada TES UVR: (1 + TIR TES TF interpolada al plazo) / (1 + TIR real UVR) − 1, comparada con la expectativa de inflación (encuesta del BanRep) y con la meta del 3 % ± 1, con la lectura (si la implícita supera las expectativas, UVR/IPC relativamente más atractivos; si es menor, tasa fija). Usa las TIR UVR que cargó el usuario o la curva UVR del servidor; si no hay, lo dice.",
    input_schema: objeto({}),
  },
  {
    name: "retorno_esperado",
    description:
      "Retorno esperado a 30, 90, 180 y 365 días si la curva no se mueve: causación (cupones + precio a tasa constante), roll-down (TIR de la curva TES al plazo restante + spread actual del título; solo tasa fija y UVR con curva), costo de fondeo configurado y total, en pesos, % del periodo y anualizado.",
    input_schema: objeto({ sobre: propSobre }),
  },
  {
    name: "analisis_titulo",
    description:
      "Análisis del título de la calculadora: semáforo de liquidez (bid-ask entre tasa de compra y de venta, monto emitido si se da, si es referencia TES), spread actual frente a la curva TES, potencial de valorización a una tasa objetivo (por defecto la tasa de venta) y, si se da la compra original, el resultado desde la compra separado en causación y valorización.",
    input_schema: objeto({
      tasa_objetivo_pct: { type: "number", description: "Tasa objetivo en % (TIR, TIR real o spread, según el tipo)." },
      monto_emitido: { type: "number", description: "Monto emitido de la emisión en pesos (opcional)." },
      fecha_compra: { type: "string", description: "Fecha de la compra original AAAA-MM-DD (para el resultado desde la compra)." },
      tasa_compra_original_pct: { type: "number", description: "Tasa de la compra original en %." },
    }),
  },
  {
    name: "simular_venta",
    description:
      "Simula vender el título de la calculadora antes del vencimiento (igual que «Simular venta»): precio sucio de venta, cupones cobrados, días, retorno del periodo, TIR de la inversión (E.A.) y ganancia en pesos. Por defecto, a la tasa de venta del título.",
    input_schema: objeto(
      {
        fecha_venta: { type: "string", description: "Fecha de venta AAAA-MM-DD." },
        tasa_venta_pct: { type: "number", description: "Tasa de venta E.A. en % (en IBR, la tasa E.A. equivalente)." },
      },
      ["fecha_venta"],
    ),
  },
  {
    name: "flujos",
    description:
      "Flujos que recibirá: para el título, cada pago pendiente (fecha, cupón %, flujo en pesos); para el portafolio, la escalera de flujos por año y por tipo. Cifras del motor.",
    input_schema: objeto({ sobre: propSobre }),
  },
  {
    name: "comparador_cdt_tes",
    description:
      "Comparador de la página: CDT vs. TES tasa fija, bono IBR, bono IPC y TES UVR al mismo monto y plazo, mantenidos al vencimiento, con el perfil tributario del usuario: ganancia bruta, después de impuestos y real (en $ y E.A.), duración, riesgo de precio, liquidez y la tabla de escenarios (tasas bajan/estables/suben, inflación alta/baja) con el ganador de cada uno.",
    input_schema: objeto(
      {
        monto: { type: "number", description: "Monto en pesos (por defecto 100 millones)." },
        plazo_anios: { type: "number", description: "Plazo en años." },
        tasa_cdt_pct: { type: "number", description: "Tasa del CDT E.A. en % (por defecto la DTF del día)." },
      },
      ["plazo_anios"],
    ),
  },
];

/* ---------- utilidades ---------- */
function curvas(ctx: ContextoHerramientas): { tf: CurvaRef; uvr: CurvaRef | null } {
  const d = ctx.snap.datos;
  return {
    tf: { fecha: d.curveDate, refs: d.tes.map((r) => [r[4], r[3]] as [number, number]) },
    uvr: d.curvaUVR ? { fecha: d.curvaUVR.fecha, refs: d.curvaUVR.tes.map((r) => [r[4], r[3]] as [number, number]) } : null,
  };
}
const costo = (ctx: ContextoHerramientas, giro: number) => (dias: number) =>
  ctx.fondeo && ctx.fondeo.tipo !== "propio" ? costoFondeo(giro, ctx.fondeo, mercadoFondeo(ctx.snap), dias) : 0;
const posiciones = (ctx: ContextoHerramientas, s?: string): PosicionAgente[] | { error: string } => {
  const cual = s ?? (ctx.titulo ? "titulo_calculadora" : "portafolio");
  if (cual === "titulo_calculadora") return ctx.titulo ? [ctx.titulo] : { error: "No hay un título válido abierto en la calculadora." };
  return ctx.portafolio.length ? ctx.portafolio : { error: "El portafolio está vacío." };
};

/* ---------- herramientas ---------- */
function herramientaCurva(ctx: ContextoHerramientas) {
  const { motor, snap } = ctx;
  const spot = (t: number) => motor.spot(t);
  const fwd = (t: number) => Math.pow(1 + spot(t), t) / Math.pow(1 + spot(t - 1), t - 1) - 1;
  const pendiente = (spot(10) - spot(1)) * 1e4;
  return {
    fecha_curva: snap.datos.curveDate,
    fuente: snap.fuentes.tes?.fuente ?? "Excel del curso",
    spot_cero_cupon: [1, 2, 3, 5, 7, 10, 15].map((t) => ({ plazo_anios: t, tasa: pct(spot(t), 3) })),
    forwards_1_anio: [2, 3, 5, 7, 10].map((t) => ({ desde_anio: t - 1, hasta_anio: t, tasa: pct(fwd(t), 3) })),
    forma: `${pendiente > 50 ? "Empinada (positiva)" : pendiente < -50 ? "Invertida" : "Plana"}: 10 años − 1 año = ${pb(pendiente)}`,
    prima_spot_1a_vs_tasa_politica: pb((spot(1) - snap.macro.tpm) * 1e4),
    tasa_politica: `${pct(snap.macro.tpm)} (${snap.macro.tpmFecha})`,
    referencias: [...snap.datos.tes].sort((a, b) => a[4] - b[4]).map((r) => ({ titulo: r[0], vence: r[1], plazo_anios: nf(2).format(r[4]), tir: pct(r[3], 3) })),
  };
}

function datosUVR(ctx: ContextoHerramientas): (DatosUVR & { origen: string }) | null {
  if (ctx.uvr && ctx.uvr.refs.length && !ctx.uvr.ejemplo) return { ...ctx.uvr, origen: `Cargadas por el usuario (${ctx.uvr.fuente})` };
  const u = ctx.snap.datos.curvaUVR;
  if (u?.tes.length) return { fecha: u.fecha, fuente: ctx.snap.fuentes.tesuvr?.fuente ?? "Cargado en /datos", refs: u.tes.map((r) => ({ titulo: r[0], vencimiento: r[1], tirReal: r[3] })), origen: "Curva TES UVR cargada en el servidor" };
  return null;
}

function herramientaInflacion(ctx: ContextoHerramientas) {
  const u = datosUVR(ctx);
  if (!u)
    return {
      error:
        "No hay TIR de TES UVR cargadas (no hay una fuente gratuita en línea). El usuario puede cargarlas en Curva TES › Inflación implícita (CSV o a mano) o en Cargar datos.",
    };
  const d = ctx.snap.datos;
  const filas = inflacionImplicita(d.tes.map((r) => [r[4], r[3]] as [number, number]), { fecha: u.fecha, refs: u.refs });
  const { filas: f, resumen } = lecturaImplicita(filas, d.exp, u.fecha);
  return {
    datos_uvr: `${u.origen} · fecha ${u.fecha}`,
    curva_tf: `TES TF ${d.curveDate}`,
    expectativas: `Encuesta del BanRep (${ctx.snap.fuentes.exp?.fuente ?? "—"})`,
    meta_banrep: `${pct(META_INFLACION.centro, 0)} ± 1 punto (${pct(META_INFLACION.min, 0)} a ${pct(META_INFLACION.max, 0)})`,
    referencias: f.map((x) => ({
      titulo: x.titulo,
      vence: x.vencimiento,
      plazo_anios: nf(2).format(x.plazo),
      tir_real_uvr: pct(x.tirReal, 3),
      tir_tes_tf_interpolada: pct(x.tirTF, 3) + (x.extrapolado ? " (fuera de la curva TF: extremo)" : ""),
      inflacion_implicita: pct(x.implicita, 2),
      expectativa: x.expectativa == null ? "—" : pct(x.expectativa, 2),
      brecha: x.brechaPb == null ? "—" : pb(x.brechaPb),
      lectura: x.senal ? TEXTO_SENAL[x.senal] : "—",
    })),
    resumen: resumen
      ? { brecha_media: pb(resumen.brechaMedia), lectura: TEXTO_SENAL[resumen.senal], explicacion: resumen.texto, fuera_del_rango_meta: resumen.fueraDeRango, umbral_neutral: `±${UMBRAL_PB} pb` }
      : "Sin expectativas cargadas para comparar.",
    nota: "La implícita incluye primas por riesgo inflacionario y por liquidez; no es solo expectativa.",
  };
}

function herramientaRetorno(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_ANALISIS.retorno_esperado>) {
  const V = posiciones(ctx, i.sobre);
  if ("error" in V) return V;
  const c = curvas(ctx);
  const filas = V.map((x) => HORIZONTES_DIAS.map((d) => retornoEsperado(ctx.motor, x.b, x.o, d, curvaPara(x.b.tipo, c.tf, c.uvr), costo(ctx, x.o.giro))));
  const total = sumarRetornos(filas);
  return {
    sobre: V.length === 1 ? V[0].titulo : `portafolio de ${V.length} títulos`,
    supuesto: `La curva TES (${ctx.snap.datos.curveDate}) no se mueve; sin reinversión de cupones; fondeo ${ctx.fondeo && ctx.fondeo.tipo !== "propio" ? "configurado por el usuario" : "con capital propio"}.`,
    horizontes: total.map((t) => ({
      dias: t.dias,
      cupones: mill(t.cupones),
      causacion: mill(t.causacion),
      roll_down: mill(t.roll),
      costo_fondeo: mill(-t.costoFondeo),
      total: mill(t.total),
      pct_del_periodo: pct(t.pct, 2),
      anualizado_ea: pct(t.anual, 2),
    })),
    por_posicion_365_dias:
      V.length > 1
        ? V.map((x, k) => {
            const r = filas[k][3];
            return "error" in r ? { titulo: x.titulo, error: r.error } : { titulo: x.titulo, roll_down: r.roll == null ? "no aplica" : mill(r.roll), total: mill(r.total), anualizado: pct(r.anual, 2) };
          })
        : undefined,
    nota: "Roll-down: tasa en el horizonte = TIR de la curva TES al plazo restante + spread actual del título. IBR e IPC no tienen roll-down (el cupón se ajusta al índice); UVR solo con curva UVR cargada.",
  };
}

function herramientaAnalisis(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_ANALISIS.analisis_titulo>) {
  const t = ctx.titulo;
  if (!t) return { error: "No hay un título válido abierto en la calculadora." };
  const { b, o } = t;
  const vencTES = ctx.snap.datos.tes.map((r) => r[1]);
  const liq = semaforoLiquidez({ tasaCompra: tasaDe(b), tasaVenta: tasaVentaDe(b), montoEmitido: i.monto_emitido ?? null, referenciaTES: esReferenciaTES(b.tipo, b.vencimiento, vencTES) });
  const sp = spreadActual(o);
  const objetivo = i.tasa_objetivo_pct != null ? i.tasa_objetivo_pct / 100 : tasaVentaDe(b);
  const val = potencialValorizacion(ctx.motor, b, o, objetivo);
  let atrib: Record<string, unknown> | string = "Para el resultado desde la compra, indique fecha_compra y tasa_compra_original_pct.";
  if (i.fecha_compra && i.tasa_compra_original_pct != null) {
    const a = atribucionDesdeCompra(ctx.motor, b, { fechaCompra: i.fecha_compra, tasaCompra: i.tasa_compra_original_pct / 100, fechaHoy: b.valoracion, tasaMercado: tasaDe(b) });
    atrib =
      "error" in a
        ? { error: a.error }
        : {
            dias: a.dias,
            invertido: mill(a.giroCompra),
            valor_hoy: mill(a.giroHoy),
            cupones_cobrados: mill(a.totalCupones),
            causacion: mill(a.causacion),
            valorizacion: mill(a.valorizacion),
            total: mill(a.total),
            rentabilidad_ea: pct(a.rentabilidadEA, 2),
          };
  }
  return {
    titulo: t.titulo,
    liquidez: { nivel: liq.nivel, color: liq.color, bid_ask: pb(liq.bidAskPb), senales: liq.senales.map((s) => `${s.nombre}: ${s.color} (${s.detalle})`) },
    spread_actual: sp ? { valor: pb(sp.pb), referencia: pct(sp.referencia, 3), como_se_mide: sp.descripcion } : "No aplica a IBR ni IPC (el spread es sobre el índice).",
    potencial_valorizacion:
      "error" in val
        ? { error: val.error }
        : {
            [`${nombreTasa(b)} de hoy`]: pct(val.tasaActual, 3),
            [`${nombreTasa(b)} objetivo`]: pct(val.tasaObjetivo, 3),
            cambio: pb(val.cambioPb),
            precio_hoy: F.n(val.precioActual, 3) + " %",
            precio_objetivo: F.n(val.precioObjetivo, 3) + " %",
            ganancia: mill(val.ganancia),
            ganancia_pct: pct(val.gananciaPct, 2),
          },
    resultado_desde_la_compra: atrib,
    nota: "Para el percentil histórico del spread, el usuario debe subir la historia en Análisis › Monitor de spreads.",
  };
}

function herramientaVenta(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_ANALISIS.simular_venta>) {
  const t = ctx.titulo;
  if (!t) return { error: "No hay un título válido abierto en la calculadora." };
  const { b, o } = t;
  const tasa = i.tasa_venta_pct != null ? i.tasa_venta_pct / 100 : b.tipo === "IBR" ? o.irrV : tasaVentaDe(b);
  const h = holding(b, o, i.fecha_venta, tasa);
  if (esError(h)) return { error: h.error };
  return {
    titulo: t.titulo,
    compra: `${b.valoracion} a ${pct(o.irr, 3)}`,
    venta: `${i.fecha_venta} a ${pct(tasa, 3)} E.A.`,
    precio_sucio_venta: F.n(h.pVenta, 3) + " %",
    cupones_cobrados: `${h.ncup} · ${F.n(h.cupones, 3)} %`,
    dias: h.dias,
    retorno_del_periodo: pct(h.retorno, 2),
    tir_de_la_inversion_ea: pct(h.tir, 3),
    frente_a_tir_de_compra: pb((h.tir - o.irr) * 1e4),
    ganancia: F.cop(h.gan),
    nota: "Para impuestos e inflación de esta venta use calcular_pyg con la misma fecha y tasa.",
  };
}

function herramientaFlujos(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_ANALISIS.flujos>) {
  const V = posiciones(ctx, i.sobre);
  if ("error" in V) return V;
  if (V.length === 1) {
    const { b, o } = V[0];
    const fut = o.rows.filter((r) => r.N > 0);
    const fx = (r: (typeof fut)[number]) => (o.tipo === "UVR" ? r.uvrP || o.fx : 1);
    const pagos = fut.map((r) => ({ fecha: toS(r.pay), cupon_pct: F.n(r.K, 4), flujo_pct: F.n(r.L, 4), flujo_pesos: F.cop((r.L / 100) * b.nominal * fx(r)) }));
    const total = fut.reduce((s, r) => s + (r.L / 100) * b.nominal * fx(r), 0);
    return { titulo: V[0].titulo, pagos_pendientes: pagos.length, total: mill(total), pagos: pagos.slice(0, 24), ...(pagos.length > 24 ? { nota: `Se muestran los primeros 24 de ${pagos.length} pagos.` } : {}) };
  }
  const m = pfMetrics(V.map((x) => ({ p: x.titulo, b: x.b, o: x.o })));
  return {
    sobre: `portafolio de ${V.length} títulos`,
    escalera_por_anio: m.ladder.map(([anio, v]) => ({ anio, total: mill(v.TF + v.IBR + v.IPC + v.UVR), tasa_fija: mill(v.TF), ibr: mill(v.IBR), ipc: mill(v.IPC), uvr: mill(v.UVR) })),
  };
}

function herramientaComparador(ctx: ContextoHerramientas, i: z.infer<typeof ENTRADAS_ANALISIS.comparador_cdt_tes>) {
  const perfil = { ...PERFIL_INICIAL, ...(ctx.tributario?.perfil ?? {}) };
  const params = ctx.tributario?.params ?? conOficiales(null);
  const tasaCDT = i.tasa_cdt_pct != null ? i.tasa_cdt_pct / 100 : (ctx.snap.dtf?.valor ?? null);
  if (tasaCDT == null) return { error: "Sin DTF del día: indique tasa_cdt_pct." };
  const e = { monto: i.monto ?? 1e8, plazoAnios: i.plazo_anios, fecha: ctx.fecha, tasaCDT };
  const filas = compararOpciones(ctx.snap.datos, e, perfil, params);
  const esc = escenariosComparador(ctx.snap.datos, e, perfil, params);
  return {
    monto: mill(e.monto),
    plazo: `${nf(1).format(e.plazoAnios)} años`,
    perfil_tributario: NOMBRE_CONTRIBUYENTE[perfil.tipo],
    tasa_cdt: `${pct(tasaCDT, 2)} E.A. ${i.tasa_cdt_pct != null ? "(dada)" : `(DTF ${ctx.snap.dtf?.fecha ?? ""})`}`,
    opciones: filas.map((f) =>
      f.pyg
        ? {
            opcion: NOMBRE_OPCION[f.opcion],
            tasa: f.tasa,
            ganancia_bruta: `${mill(f.pyg.utilidadAntes)} (${textoRent(f.pyg.rentNominal)} E.A.)`,
            despues_de_impuestos: `${mill(f.pyg.neta)} (${textoRent(f.pyg.rentDespues)} E.A.)`,
            real: `${mill(f.pyg.real)} (${textoRent(f.pyg.rentReal)} E.A.)`,
            duracion: f.duracion == null ? "—" : F.n(f.duracion, 2),
            riesgo_de_precio: RIESGO[f.opcion].precio,
            liquidez: RIESGO[f.opcion].liquidez,
          }
        : { opcion: NOMBRE_OPCION[f.opcion], error: f.error },
    ),
    escenarios: esc.map((x) => ({
      escenario: x.escenario.nombre,
      ganancia_real: Object.fromEntries(Object.entries(x.reales).map(([k, v]) => [NOMBRE_OPCION[k as keyof typeof NOMBRE_OPCION], mill(v as number)])),
      gana: x.ganador ? NOMBRE_OPCION[x.ganador] : "—",
    })),
    supuestos:
      "Al vencimiento, sin reinversión. IBR, IPC y UVR con los spreads del ejemplo de la calculadora. Tasas ±100 pb mueven el IBR; inflación ±2 pp mueve los flujos IPC/UVR y la inflación del periodo.",
    aviso: "Estimación con fines académicos. No constituye asesoría tributaria; confirme con un contador.",
  };
}

type Entrada<K extends keyof typeof ENTRADAS_ANALISIS> = z.infer<(typeof ENTRADAS_ANALISIS)[K]>;

export function ejecutarAnalisis(n: keyof typeof ENTRADAS_ANALISIS, data: unknown, ctx: ContextoHerramientas) {
  switch (n) {
    case "curva_tes":
      return herramientaCurva(ctx);
    case "inflacion_implicita":
      return herramientaInflacion(ctx);
    case "retorno_esperado":
      return herramientaRetorno(ctx, data as Entrada<"retorno_esperado">);
    case "analisis_titulo":
      return herramientaAnalisis(ctx, data as Entrada<"analisis_titulo">);
    case "simular_venta":
      return herramientaVenta(ctx, data as Entrada<"simular_venta">);
    case "flujos":
      return herramientaFlujos(ctx, data as Entrada<"flujos">);
    case "comparador_cdt_tes":
      return herramientaComparador(ctx, data as Entrada<"comparador_cdt_tes">);
  }
}
