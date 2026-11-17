/* Reporte PDF del portafolio: una página carta. Cifras de armarReportePortafolio (lib/reporte/datos.ts),
   que solo lee lib/engine (pfMetrics) y lib/cliente (motor + lib/carry). */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { BRAND } from "@/lib/brand";
import { F, nf } from "@/lib/format";
import type { ReportePortafolio } from "@/lib/reporte/datos";
import { C, FAMILIA } from "@/lib/reporte/estilo";
import { PaginaPyG, type DatosPyGReporte } from "./PaginaPyG";
import { Encabezado, Pie, Seccion, s } from "./piezas";

const MAX_FILAS = 14;
const COLOR_TIPO: Record<string, string> = { "Tasa fija": C.acento, IBR: C.doradoTexto, IPC: C.negativo, UVR: C.tinta3 };

function Cifra({ etiqueta, valor, nota, grande }: { etiqueta: string; valor: string; nota?: string; grande?: boolean }) {
  return (
    <View style={{ flexGrow: grande ? 1.4 : 1, flexBasis: 0 }}>
      <Text style={{ fontSize: 7.5, color: "#D7EDEC", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>{etiqueta}</Text>
      <View style={{ height: grande ? 36 : 22, marginTop: 2, justifyContent: "flex-end" }}>
        <Text style={{ fontWeight: 600, fontSize: grande ? 24 : 15, color: C.acentoSobre }}>{valor}</Text>
      </View>
      {nota ? <Text style={{ fontSize: 7.5, color: "#D7EDEC", marginTop: 3 }}>{nota}</Text> : null}
    </View>
  );
}

const celda = (ancho: number, derecha = true) => ({ width: ancho, textAlign: derecha ? ("right" as const) : ("left" as const) });

export function DocPortafolio({ r, generado, pyg }: { r: ReportePortafolio; generado: string; pyg?: DatosPyGReporte | null }) {
  const filas = r.posiciones.slice(0, MAX_FILAS);
  const maxEstres = Math.max(...r.estres.map((e) => Math.abs(e.cambio)), 1);
  return (
    <Document title="Reporte del portafolio" author={BRAND.nombre} subject="Reporte del portafolio" creator={BRAND.nombre} language="es-CO">
      <Page size="LETTER" style={s.pagina}>
        <Encabezado tipo="Reporte del portafolio" titulo={`Portafolio · ${r.posiciones.length} títulos`} valoracion={r.valoracion} cliente={r.cliente} />

        <View style={{ marginTop: 14, backgroundColor: C.acento, borderRadius: 8, padding: 16, flexDirection: "row", gap: 14 }}>
          <Cifra etiqueta="Valor total" valor={F.mill(r.valor, 1)} nota={`TIR promedio ${F.pct(r.tir, 2)} E.A.`} grande />
          <Cifra etiqueta="Ganancia anual estimada" valor={F.mill(r.gananciaAnual, 1)} nota={`${F.cop(r.gananciaDiaria)} cada día`} />
          <Cifra etiqueta="Colchón" valor={`${nf(0).format(r.colchonPb)} pb`} nota="Subida de tasas que aguanta un año sin perder" />
        </View>

        <View style={{ ...s.fila, gap: 14, marginTop: 14 }}>
          <Seccion titulo="Composición por tipo" style={{ flexGrow: 1, flexBasis: 0 }}>
            <View style={{ flexDirection: "row", height: 12, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
              {r.composicion.map((c) => (
                <View key={c.tipo} style={{ width: `${c.peso * 100}%`, backgroundColor: COLOR_TIPO[c.tipo] ?? C.tinta3 }} />
              ))}
            </View>
            {r.composicion.map((c) => (
              <View key={c.tipo} style={s.kvFila}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 6, height: 6, backgroundColor: COLOR_TIPO[c.tipo] ?? C.tinta3 }} />
                  <Text style={s.kvL}>{c.tipo}</Text>
                </View>
                <Text style={s.kvV}>
                  {F.pct(c.peso, 1)} · {F.mill(c.valor, 1)}
                </Text>
              </View>
            ))}
          </Seccion>
          <Seccion titulo="Riesgo en palabras simples" style={{ flexGrow: 1, flexBasis: 0 }}>
            <View style={{ ...s.caja, gap: 6 }}>
              <Text>
                <Text style={{ fontWeight: 600 }}>Duración {F.n(r.duracionMod, 2)}. </Text>
                <Text style={{ color: C.tinta2 }}>Si las tasas suben 1 %, el portafolio cae cerca de {F.n(r.duracionMod, 2)} %. Macaulay {F.n(r.macaulay, 2)} años.</Text>
              </Text>
              <Text>
                <Text style={{ fontWeight: 600 }}>DV01 {F.cop(r.dv01)}. </Text>
                <Text style={{ color: C.tinta2 }}>Cambio de valor por cada punto básico.</Text>
              </Text>
            </View>
          </Seccion>
        </View>

        <Seccion titulo="Escenarios de estrés (revaloración completa)" style={{ marginTop: 14 }}>
          {r.estres.map((e) => (
            <View key={e.escenario} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 1.8 }}>
              <Text style={{ width: 70, color: C.tinta2 }}>{e.escenario}</Text>
              <View style={{ flexGrow: 1, flexDirection: "row", height: 7 }}>
                <View style={{ width: "50%", flexDirection: "row", justifyContent: "flex-end" }}>
                  {e.cambio < 0 && <View style={{ width: `${(Math.abs(e.cambio) / maxEstres) * 100}%`, backgroundColor: C.negativo }} />}
                </View>
                <View style={{ width: 0.75, backgroundColor: C.tinta3 }} />
                <View style={{ width: "50%", flexDirection: "row" }}>
                  {e.cambio > 0 && <View style={{ width: `${(e.cambio / maxEstres) * 100}%`, backgroundColor: C.positivo }} />}
                </View>
              </View>
              <Text style={{ width: 92, textAlign: "right", fontFamily: FAMILIA.mono, fontSize: 8, color: e.cambio >= 0 ? C.positivo : C.negativo }}>
                {F.mill(e.cambio, 1)}
              </Text>
              <Text style={{ width: 52, textAlign: "right", fontFamily: FAMILIA.mono, fontSize: 8, color: C.tinta2 }}>{F.pct(e.pct, 2).replace("-", "−")}</Text>
            </View>
          ))}
        </Seccion>

        <Seccion titulo="Posiciones" style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", paddingBottom: 3, borderBottomWidth: 0.75, borderBottomColor: C.tinta3 }}>
            {[
              ["Título", 150, false],
              ["Tipo", 40, false],
              ["Nominal", 74, true],
              ["TIR", 52, true],
              ["Sucio", 52, true],
              ["Giro", 84, true],
              ["Dur.", 40, true],
            ].map(([t, w, d]) => (
              <Text key={t as string} style={{ ...celda(w as number, d as boolean), fontSize: 7, fontWeight: 600, color: C.tinta2, textTransform: "uppercase" }}>
                {t as string}
              </Text>
            ))}
          </View>
          {filas.map((p, i) => (
            <View key={i} style={{ flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: C.linea }}>
              <Text style={celda(150, false)}>{p.titulo}</Text>
              <Text style={celda(40, false)}>{p.tipo}</Text>
              <Text style={{ ...celda(74), fontFamily: FAMILIA.mono }}>{F.mill(p.nominal, 0)}</Text>
              <Text style={{ ...celda(52), fontFamily: FAMILIA.mono }}>{F.pct(p.tir, 2)}</Text>
              <Text style={{ ...celda(52), fontFamily: FAMILIA.mono }}>{F.n(p.sucio, 3)}</Text>
              <Text style={{ ...celda(84), fontFamily: FAMILIA.mono }}>{F.mill(p.giro, 1)}</Text>
              <Text style={{ ...celda(40), fontFamily: FAMILIA.mono }}>{F.n(p.duracionMod, 2)}</Text>
            </View>
          ))}
          {r.posiciones.length > MAX_FILAS && (
            <Text style={{ ...s.src, marginTop: 3 }}>Y {r.posiciones.length - MAX_FILAS} posiciones más (incluidas en los totales).</Text>
          )}
        </Seccion>

        <Pie fuentes={r.fuentes} generado={generado} />
      </Page>
      {pyg ? <PaginaPyG d={pyg} titulo={`Portafolio · ${r.posiciones.length} títulos`} valoracion={r.valoracion} cliente={r.cliente} fuentes={r.fuentes} generado={generado} /> : null}
    </Document>
  );
}
