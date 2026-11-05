/* Prompt de sistema, consultas rápidas y contexto que recibe el asesor de IA (del prototipo).
   En la Fase 4 app/api/asesor usará SYS y el JSON de ctxSnapshot. */
import type { Motor, MetricasPortafolio, PosicionValorada } from "@/lib/engine";
import type { SnapshotMercado } from "@/lib/data/mercado";
import type { MercadoDerivado } from "@/lib/mercado-derivado";
import type { Posicion } from "@/lib/calculadora";
import { curvaBreakeven } from "@/lib/breakeven";

/** Mensaje del modo demo (sin ANTHROPIC_API_KEY en el servidor). */
export const MENSAJE_DEMO = "Demo del asesor disponible en la presentación. Se activa al configurar la clave de API.";

export const SYS =`Eres el asesor de una calculadora académica de renta fija colombiana (curso de portafolio de renta fija). Respondes en español de Colombia, con criterio de analista de mesa de dinero, claro y estructurado.
Reglas: usa SOLO los datos del bloque CONTEXTO para cifras; si algo no está, dilo. Cita la fuente/fecha del dato (BanRep, DANE, curva cargada). Explica el porqué con conceptos del curso (duración, convexidad, carry, roll-down, spread vs. TES, tasa real, Fisher, riesgo de reinversión). Da escenarios y alternativas, no órdenes de compra/venta, y cierra con una línea recordando que es un ejercicio académico y no asesoría financiera.
Formato: títulos cortos con "### ", viñetas con "- ", negritas con **. Máximo ~350 palabras salvo que pidan más.`;

/** [título, descripción, pregunta completa] */
export const QUICK: [string, string, string][] = [
  ["Resumen de la economía", "Inflación, tasa del BanRep, IBR y lo que implica para la renta fija", "Hazme un resumen de la situación económica de Colombia con estos datos: inflación, política monetaria, IBR, UVR y la curva TES. ¿Qué implica para un inversionista de renta fija?"],
  ["Analiza mi portafolio", "Riesgo, composición, valor relativo vs. curva", "Analiza mi portafolio: composición por indexación, duración y DV01, resultados de estrés y spread de cada posición frente a la curva TES. ¿Tengo buenas posiciones para el contexto actual?"],
  ["Estrategia de duración", "¿Alargar o acortar? ¿Tasa fija o indexados?", "Con la curva y las expectativas de inflación cargadas, ¿conviene alargar o acortar duración? Compara tasa fija vs. IBR vs. IPC vs. UVR y propón dos estrategias con sus riesgos."],
  ["Explica la curva", "Forma, forwards y qué descuenta el mercado", "Explícame la forma actual de la curva TES, qué descuentan los forwards implícitos y cómo se compara con la tasa de política."],
];

export function ctxSnapshot(
  snap: SnapshotMercado,
  mk: MercadoDerivado,
  motor: Motor,
  V: PosicionValorada<Posicion>[],
  m: MetricasPortafolio | null,
) {
  const { macro } = snap;
  const z = motor.spot;
  const ibr = mk.ibrLast.d;
  return {
    fecha_analisis: snap.fechaAnalisis,
    macro: {
      tasa_politica: macro.tpm,
      fecha_dato_tasa: macro.tpmFecha,
      fuente_tasa: macro.tpmFuente,
      ultima_decision_junta: { fecha: macro.decisionFecha, decision: macro.decision },
      trm: snap.trm ? { valor: snap.trm.valor, fecha: snap.trm.fecha } : null,
      inflacion_12m: mk.ipcLast.annual,
      mes_inflacion: mk.ipcLast.f,
      inflacion_nucleo: macro.nucleo,
      expectativa_inflacion_2a: macro.exp2y,
      tasa_real_ex_post: mk.realRate,
      ibr: { fecha: mk.ibrLast.f, overnight: ibr[1] / 100, m1: ibr[2] / 100, m3: ibr[3] / 100, m6: ibr[4] / 100, m12: ibr[5] / 100 },
      uvr: mk.uvrHoy.v,
      ipc_ultimos_12m: mk.ipcV.slice(-12).map((r) => [r.f.slice(0, 7), +r.annual.toFixed(4)]),
      expectativas_ipc: motor.mercado.exp.slice(0, 12).map((r) => [r.f.slice(0, 7), +r.d[1].toFixed(4)]),
    },
    inflacion_implicita: (() => {
      const be = curvaBreakeven(snap.datos);
      if (!be) return null;
      return {
        fecha_curva_uvr: be.fechaReal,
        breakeven: be.puntos.filter((p) => [1, 2, 3, 5, 7, 10].includes(p.t)).map((p) => [p.t, +p.breakeven.toFixed(4)]),
      };
    })(),
    curva_tes: {
      fecha: motor.mercado.curveDate,
      spot: [0.5, 1, 2, 3, 5, 7, 10].map((t) => [t, +z(t).toFixed(4)]),
      referencias: mk.tesSorted.map((r) => ({ titulo: r[0], tir: r[3], plazo: +r[4].toFixed(2) })),
    },
    portafolio: m
      ? {
          valor_mercado_cop: Math.round(m.mv),
          tir_ponderada_pesos: +m.ytm.toFixed(4),
          duracion_mod: +m.mod.toFixed(3),
          dv01_cop: Math.round(m.dv01),
          convexidad: +m.conv.toFixed(2),
          composicion: Object.fromEntries(Object.entries(m.byType).map(([k, v]) => [k, +((v as number) / m.mv).toFixed(3)])),
          estres_cop: Object.fromEntries(m.stress.map((s) => [s[0], Math.round(s[1])])),
          posiciones: V.map((x) => ({
            nombre: x.p.inputs.nombre,
            tipo: x.b.tipo,
            vencimiento: x.b.vencimiento,
            tir: +x.o.irr.toFixed(4),
            tir_pesos: +x.o.yieldCOP.toFixed(4),
            duracion_mod: +x.o.mod.toFixed(3),
            peso: +(x.o.giro / m.mv).toFixed(3),
            spread_vs_tes_pb: Math.round((x.o.yieldCOP - z(x.o.mac)) * 1e4),
          })),
        }
      : null,
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Markdown mínimo (### títulos, - viñetas, **negrita**) → HTML. Escapa el texto primero. */
export function md(t: string): string {
  const lines = esc(t).split("\n");
  let h = "",
    inL = false;
  for (let l of lines) {
    l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (/^\s*[-•]\s+/.test(l)) {
      if (!inL) {
        h += "<ul>";
        inL = true;
      }
      h += "<li>" + l.replace(/^\s*[-•]\s+/, "") + "</li>";
      continue;
    }
    if (inL) {
      h += "</ul>";
      inL = false;
    }
    if (/^#{1,4}\s/.test(l)) h += "<h4>" + l.replace(/^#{1,4}\s/, "") + "</h4>";
    else if (l.trim()) h += "<p>" + l + "</p>";
  }
  if (inL) h += "</ul>";
  return h;
}
