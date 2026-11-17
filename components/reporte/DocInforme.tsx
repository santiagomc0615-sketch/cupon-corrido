/* Informe para el cliente generado por el asesor de IA (PDF carta). El texto viene de la respuesta
   del agente, cuyas cifras salen de las herramientas del motor; aquí solo se da formato. */
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { SeccionInforme } from "@/lib/asesor/informe";
import { BRAND } from "@/lib/brand";
import type { FuenteReporte } from "@/lib/reporte/datos";
import { C, FAMILIA } from "@/lib/reporte/estilo";
import { Encabezado, Pie, s } from "./piezas";

export interface DatosInforme {
  secciones: SeccionInforme[];
  perfil: string;
  valoracion: string;
  cliente: string;
  fuentes: FuenteReporte[];
}

/** Partes de una línea como Text anidados (sin fragmentos: react-pdf no los admite dentro de Text). */
const linea = (partes: SeccionInforme["bloques"][number]["partes"]) =>
  partes.map((p, i) =>
    p.negrita ? (
      <Text key={i} style={{ fontWeight: 600, color: C.tinta }}>
        {p.t}
      </Text>
    ) : (
      <Text key={i}>{p.t}</Text>
    ),
  );

export function DocInforme({ r, generado }: { r: DatosInforme; generado: string }) {
  return (
    <Document title="Informe para el cliente" author={BRAND.nombre} subject="Informe para el cliente" creator={BRAND.nombre} language="es-CO">
      <Page size="LETTER" style={s.pagina} wrap>
        <Encabezado tipo="Informe para el cliente" titulo={`Perfil ${r.perfil}`} valoracion={r.valoracion} cliente={r.cliente} />

        <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Text style={{ ...s.src, color: C.doradoTexto, letterSpacing: 0.8, textTransform: "uppercase" }}>Respuestas generadas por IA</Text>
          <Text style={s.src}>· Cifras calculadas con el motor de la calculadora (validado contra el Excel del curso)</Text>
        </View>

        <View style={{ marginTop: 8, gap: 10 }}>
          {r.secciones.map((sec, i) => (
            <View key={i} wrap={false} style={{ gap: 3 }}>
              {sec.titulo ? (
                <Text style={{ fontFamily: FAMILIA.display, fontSize: 12.5, fontWeight: 500, color: C.acento, marginBottom: 2 }}>{sec.titulo}</Text>
              ) : null}
              {sec.bloques.map((b, j) =>
                b.tipo === "li" ? (
                  <View key={j} style={{ flexDirection: "row", gap: 5, paddingLeft: 4 }}>
                    <Text style={{ color: C.dorado }}>•</Text>
                    <Text style={{ flex: 1, lineHeight: 1.45, color: C.tinta2, fontSize: 9 }}>
                      {linea(b.partes)}
                    </Text>
                  </View>
                ) : (
                  <Text key={j} style={{ lineHeight: 1.5, color: C.tinta2, fontSize: 9 }}>
                    {linea(b.partes)}
                  </Text>
                ),
              )}
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14 }} />
        <Pie fuentes={r.fuentes} generado={generado} />
      </Page>
    </Document>
  );
}
