/* Piezas comunes del reporte PDF (@react-pdf/renderer): fuentes, estilos, logo, encabezado y pie. */
import { Font, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { F } from "@/lib/format";
import type { FuenteReporte } from "@/lib/reporte/datos";
import { ARCHIVOS_FUENTE, C, FAMILIA, trazosGuilloche } from "@/lib/reporte/estilo";

let registradas = false;
/** Registra las tipografías una vez. `base`: URL del sitio (navegador) o carpeta de public (Node). */
export function registrarFuentes(base: string) {
  if (registradas) return;
  const src = (a: string) => `${base.replace(/\/$/, "")}/fonts/pdf/${a}`;
  Font.register({ family: FAMILIA.display, fonts: ARCHIVOS_FUENTE.display.map((f) => ({ src: src(f.archivo), fontWeight: f.peso })) });
  Font.register({ family: FAMILIA.texto, fonts: ARCHIVOS_FUENTE.texto.map((f) => ({ src: src(f.archivo), fontWeight: f.peso })) });
  Font.register({ family: FAMILIA.mono, fonts: ARCHIVOS_FUENTE.mono.map((f) => ({ src: src(f.archivo), fontWeight: f.peso })) });
  Font.registerHyphenationCallback((w) => [w]); // sin cortes de palabra
  registradas = true;
}

export const s = StyleSheet.create({
  pagina: { padding: 34, paddingBottom: 30, fontFamily: FAMILIA.texto, fontSize: 8.5, color: C.tinta, backgroundColor: C.hoja },
  fila: { flexDirection: "row" },
  h2: { fontFamily: FAMILIA.texto, fontWeight: 600, fontSize: 8, color: C.tinta2, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 },
  caja: { borderWidth: 0.75, borderColor: C.linea, borderRadius: 6, padding: 10 },
  mono: { fontFamily: FAMILIA.mono },
  src: { fontFamily: FAMILIA.mono, fontSize: 6.5, color: C.tinta3 },
  kvFila: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.6, borderBottomWidth: 0.5, borderBottomColor: C.linea },
  kvL: { color: C.tinta2 },
  kvV: { fontFamily: FAMILIA.mono, fontWeight: 500 },
});

export function Logo({ lado = 30 }: { lado?: number }) {
  return (
    <Svg width={lado} height={lado} viewBox="0 0 100 100">
      {trazosGuilloche(BRAND.logo.sello).map((d, i) => (
        <Path key={i} d={d} stroke={C.acento} strokeWidth={0.8} strokeOpacity={0.75} fill="none" />
      ))}
    </Svg>
  );
}

export function Encabezado({ tipo, titulo, valoracion, cliente }: { tipo: string; titulo: string; valoracion: string; cliente: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: C.acento }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Logo />
        <View>
          <Text style={{ fontFamily: FAMILIA.display, fontSize: 17, fontWeight: 500 }}>{BRAND.nombre}</Text>
          <Text style={{ ...s.src, letterSpacing: 1, textTransform: "uppercase" }}>{BRAND.eslogan}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 330 }}>
        <Text style={{ ...s.src, letterSpacing: 1, textTransform: "uppercase" }}>{tipo}</Text>
        <Text style={{ fontFamily: FAMILIA.display, fontSize: 15, fontWeight: 500, textAlign: "right" }}>{titulo}</Text>
        <Text style={{ fontSize: 8, color: C.tinta2, marginTop: 2 }}>
          Valoración: {F.date(valoracion)}
          {cliente ? `  ·  Cliente: ${cliente}` : ""}
        </Text>
      </View>
    </View>
  );
}

/** Pie: fuentes y fechas de los datos de mercado, y el aviso legal. */
export function Pie({ fuentes, generado }: { fuentes: FuenteReporte[]; generado: string }) {
  return (
    <View style={{ marginTop: "auto", paddingTop: 7, borderTopWidth: 0.75, borderTopColor: C.linea }}>
      <Text style={s.src}>
        Fuentes: {fuentes.map((f) => `${f.serie}: ${f.fuente}${f.fecha ? " (" + F.date(f.fecha) + ")" : ""}`).join(" · ")}.
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ fontSize: 7, fontWeight: 600, color: C.tinta2 }}>Herramienta académica, no constituye asesoría financiera.</Text>
        <Text style={s.src}>
          {BRAND.nombre} · generado el {generado}
        </Text>
      </View>
    </View>
  );
}

export function Seccion({ titulo, children, style }: { titulo: string; children: ReactNode; style?: Style }) {
  return (
    <View style={style}>
      <Text style={s.h2}>{titulo}</Text>
      {children}
    </View>
  );
}

export function KV({ filas }: { filas: [string, string][] }) {
  return (
    <View>
      {filas.map(([l, v], i) => (
        <View key={i} style={s.kvFila}>
          <Text style={s.kvL}>{l}</Text>
          <Text style={s.kvV}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** Fecha y hora de Bogotá para el pie. */
export const ahora = () => new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
