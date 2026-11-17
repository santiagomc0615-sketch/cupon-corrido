/* Página del reporte PDF con el estado de resultados (P&G) con impuestos e inflación (lib/pyg). */
import { Page, Text, View } from "@react-pdf/renderer";
import { F, nf } from "@/lib/format";
import type { ResultadoPyG } from "@/lib/pyg/estado";
import type { FuenteReporte } from "@/lib/reporte/datos";
import { C, FAMILIA } from "@/lib/reporte/estilo";
import { Encabezado, Pie, Seccion, s } from "./piezas";

export interface DatosPyGReporte {
  resultado: ResultadoPyG;
  /** Supuesto de venta (p. ej. «al vencimiento»). */
  supuesto: string;
  perfil: string;
}

export const AVISO_TRIBUTARIO_PDF = "Estimación con fines académicos. No constituye asesoría tributaria; confirme con un contador.";

const pesos = (v: number) => (v < 0 ? "−" : "") + "$ " + nf(0).format(Math.abs(Math.round(v)));

export function PaginaPyG({
  d,
  titulo,
  valoracion,
  cliente,
  fuentes,
  generado,
}: {
  d: DatosPyGReporte;
  titulo: string;
  valoracion: string;
  cliente: string;
  fuentes: FuenteReporte[];
  generado: string;
}) {
  const r = d.resultado;
  const pct = (v: number) => F.pct(r.capital ? v / r.capital : 0, 2);
  return (
    <Page size="LETTER" style={s.pagina}>
      <Encabezado tipo="Venta y P&G · estado de resultados" titulo={titulo} valoracion={valoracion} cliente={cliente} />
      <Text style={{ marginTop: 10, fontSize: 8.5, color: C.tinta2 }}>
        {d.supuesto} · {nf(0).format(r.dias)} días · {d.perfil}
      </Text>
      <View style={{ marginTop: 6, padding: 7, borderLeftWidth: 2.5, borderLeftColor: C.dorado, backgroundColor: C.hoja2 }}>
        <Text style={{ fontSize: 7.5, color: C.tinta2 }}>{AVISO_TRIBUTARIO_PDF}</Text>
      </View>

      <Seccion titulo="Estado de resultados" style={{ marginTop: 12 }}>
        <View style={{ ...s.fila, paddingBottom: 3, borderBottomWidth: 0.75, borderBottomColor: C.linea }}>
          <Text style={{ width: 14 }} />
          <Text style={{ flex: 1, ...s.src }}>CONCEPTO</Text>
          <Text style={{ width: 110, textAlign: "right", ...s.src }}>PESOS</Text>
          <Text style={{ width: 70, textAlign: "right", ...s.src }}>% DEL CAPITAL</Text>
        </View>
        {r.lineas.map((l) => {
          const total = l.tipo === "total";
          const info = l.tipo === "info";
          return (
            <View
              key={l.clave}
              wrap={false}
              style={{
                ...s.fila,
                paddingVertical: 3.5,
                borderBottomWidth: 0.5,
                borderBottomColor: C.linea,
                ...(total ? { backgroundColor: C.hoja2, borderTopWidth: 1, borderTopColor: C.tinta3 } : {}),
              }}
            >
              <Text style={{ width: 14, color: C.tinta3, ...s.mono }}>{l.signo}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: total ? 600 : 400, color: info ? C.tinta2 : C.tinta }}>{l.etiqueta}</Text>
                {l.nota ? <Text style={{ ...s.src, marginTop: 1 }}>{l.nota}</Text> : null}
              </View>
              <Text
                style={{
                  width: 110,
                  textAlign: "right",
                  ...s.mono,
                  fontWeight: total ? 600 : 400,
                  color: l.clave === "real" ? C.acento : info ? C.tinta2 : C.tinta,
                }}
              >
                {pesos(l.valor)}
              </Text>
              <Text style={{ width: 70, textAlign: "right", ...s.mono, color: C.tinta2 }}>{pct(l.valor)}</Text>
            </View>
          );
        })}
      </Seccion>

      <View style={{ ...s.fila, gap: 8, marginTop: 12 }}>
        {[
          ["Rentabilidad nominal", r.rentNominal, "E.A. antes de impuestos", false],
          ["Después de impuestos", r.rentDespues, "E.A.", false],
          ["Real", r.rentReal, "E.A. después de impuestos e inflación", true],
        ].map(([l, v, n, real]) => (
          <View key={l as string} style={{ ...s.caja, flexGrow: 1, flexBasis: 0, padding: 8, ...(real ? { borderColor: C.acento } : {}) }}>
            <Text style={{ fontSize: 7, color: C.tinta2 }}>{l as string}</Text>
            <View style={{ height: 18, justifyContent: "flex-end" }}>
              <Text style={{ fontWeight: 600, fontSize: 14, color: real ? C.acento : C.tinta, fontFamily: FAMILIA.texto }}>{F.pct(v as number, 2)}</Text>
            </View>
            <Text style={{ ...s.src, marginTop: 2 }}>{n as string}</Text>
          </View>
        ))}
      </View>
      <Text style={{ marginTop: 10, fontSize: 10, fontWeight: 600 }}>{r.frase}</Text>
      {r.notas.map((n) => (
        <Text key={n} style={{ ...s.src, marginTop: 4, fontSize: 7 }}>
          {n}
        </Text>
      ))}

      <Pie fuentes={fuentes} generado={generado} />
    </Page>
  );
}
