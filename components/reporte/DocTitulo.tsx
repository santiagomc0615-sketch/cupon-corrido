/* Reporte PDF de un título: una página carta. Todas las cifras vienen de armarReporteTitulo
   (lib/reporte/datos.ts), que solo lee lib/engine y lib/carry. */
import { Document, G, Line, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { F, nf } from "@/lib/format";
import type { FlujoReporte, ReporteTitulo } from "@/lib/reporte/datos";
import { C, FAMILIA } from "@/lib/reporte/estilo";
import { BRAND } from "@/lib/brand";
import { PaginaPyG, type DatosPyGReporte } from "./PaginaPyG";
import { Encabezado, KV, Pie, Seccion, s } from "./piezas";

const pct = (x: number, d = 2) => F.pct(x, d);
const mill = (x: number, d = 1) => F.mill(x, d);

function Cifra({ etiqueta, valor, nota, grande }: { etiqueta: string; valor: string; nota?: string; grande?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 0 }}>
      <Text style={{ fontSize: 7.5, color: "#D7EDEC", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600 }}>{etiqueta}</Text>
      <View style={{ height: grande ? 38 : 22, marginTop: 2, justifyContent: "flex-end" }}>
        <Text style={{ fontFamily: FAMILIA.texto, fontWeight: 600, fontSize: grande ? 26 : 15, color: C.acentoSobre }}>{valor}</Text>
      </View>
      {nota ? <Text style={{ fontSize: 7.5, color: "#D7EDEC", marginTop: 3 }}>{nota}</Text> : null}
    </View>
  );
}

/** Barras de flujos: cupón (acento) y capital (dorado), en pesos. La escala es la de los cupones para
    que se vean; el pago de capital (mucho mayor) llega al tope con su valor escrito. */
function GraficoFlujos({ flujos }: { flujos: FlujoReporte[] }) {
  const W = 250,
    H = 112,
    base = H - 14,
    tope = 16;
  const maxCupon = Math.max(...flujos.map((f) => f.cupon), 1);
  const esc = (v: number) => (v / maxCupon) * (base - tope - 30);
  const paso = W / Math.max(flujos.length, 1);
  const bw = Math.max(1.2, Math.min(10, paso * 0.62));
  const anios = new Set<string>();
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={0} x2={W} y1={base} y2={base} stroke={C.linea} strokeWidth={0.75} />
      {flujos.map((f, i) => {
        const x = i * paso + (paso - bw) / 2;
        const hC = esc(f.cupon) || 0;
        const anio = f.fecha.slice(0, 4);
        const etiqueta = !anios.has(anio);
        anios.add(anio);
        return (
          <G key={i}>
            <Rect x={x} y={base - hC} width={bw} height={Math.max(0.6, hC)} fill={C.acento} />
            {f.capital > 0 && (
              <G>
                <Rect x={x} y={tope} width={bw} height={Math.max(0, base - hC - tope)} fill={C.dorado} />
                <Text x={Math.max(0, x + bw - 92)} y={tope - 4} style={{ fontSize: 6.5, fontFamily: FAMILIA.mono }} fill={C.doradoTexto}>
                  {"Capital " + F.mill(f.capital, 0)}
                </Text>
              </G>
            )}
            {etiqueta && (
              <Text x={x} y={H - 3} style={{ fontSize: 6, fontFamily: FAMILIA.mono }} fill={C.tinta3}>
                {anio}
              </Text>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <View style={{ width: 6, height: 6, backgroundColor: color }} />
      <Text style={s.src}>{texto}</Text>
    </View>
  );
}

export function DocTitulo({ r, generado, pyg }: { r: ReporteTitulo; generado: string; pyg?: DatosPyGReporte | null }) {
  const c = r.cliente_;
  const pc = c.proximo;
  return (
    <Document title={`Reporte ${r.titulo}`} author={BRAND.nombre} subject="Reporte del título" creator={BRAND.nombre} language="es-CO">
      <Page size="LETTER" style={s.pagina}>
        <Encabezado tipo={`Reporte del título · ${r.tipo}`} titulo={r.titulo} valoracion={r.valoracion} cliente={r.cliente} />

        {/* Bloque principal: lo que gana el cliente */}
        <View style={{ marginTop: 14, backgroundColor: C.acento, borderRadius: 8, padding: 16, flexDirection: "row", gap: 14 }}>
          <View style={{ flexGrow: 1.5, flexBasis: 0 }}>
            <Cifra etiqueta="Gana al año" valor={mill(c.gananciaAnual)} nota={`${F.cop(c.gananciaDiaria)} cada día · TIR ${pct(c.tir)} E.A.`} grande />
          </View>
          {pc && <Cifra etiqueta="Próximo cupón" valor={mill(pc.cop)} nota={`${F.date(pc.fecha)} · ${F.n(pc.pct, 3)} % · faltan ${pc.dias} días`} />}
          <Cifra etiqueta="Recibe hasta el vencimiento" valor={mill(c.totalPagos)} nota={`${c.pagos.length} pagos · invertido ${mill(c.giro)}`} />
        </View>

        <View style={{ ...s.fila, gap: 14, marginTop: 14 }}>
          <Seccion titulo="Datos del título" style={{ flexGrow: 1, flexBasis: 0 }}>
            <KV
              filas={[
                ["Tipo", r.tipo],
                ["Emisión", F.date(r.emision)],
                ["Vencimiento", F.date(r.vencimiento)],
                ["Condición", r.condicion],
                ["Valor nominal", F.cop(r.nominal)],
                ["TIR de compra", pct(r.tir, 3) + " E.A."],
                ["Precio sucio", F.n(r.sucio, 3) + " %"],
                ["Precio limpio", F.n(r.limpio, 3) + " %"],
                ["Valor de giro", F.cop(r.giro)],
              ]}
            />
          </Seccion>
          <Seccion titulo="Riesgo en palabras simples" style={{ flexGrow: 1, flexBasis: 0 }}>
            <View style={{ ...s.caja, gap: 7 }}>
              <Text>
                <Text style={{ fontWeight: 600 }}>Duración {F.n(r.duracionMod, 2)}. </Text>
                <Text style={{ color: C.tinta2 }}>Si las tasas suben 1 %, el precio cae cerca de {F.n(r.duracionMod, 2)} %. Duración de Macaulay: {F.n(r.macaulay, 2)} años.</Text>
              </Text>
              <Text>
                <Text style={{ fontWeight: 600 }}>DV01 {F.cop(r.dv01)}. </Text>
                <Text style={{ color: C.tinta2 }}>Es lo que cambia el valor por cada punto básico (0,01 %) que se mueva la tasa.</Text>
              </Text>
              <Text>
                <Text style={{ fontWeight: 600, color: C.positivo }}>Colchón {nf(0).format(c.colchonPb)} pb. </Text>
                <Text style={{ color: C.tinta2 }}>Las tasas pueden subir hasta {nf(0).format(c.colchonPb)} pb en un año antes de perder plata.</Text>
              </Text>
            </View>
          </Seccion>
        </View>

        <View style={{ ...s.fila, gap: 14, marginTop: 14 }}>
          <Seccion titulo="Flujos que recibe (pesos)" style={{ flexGrow: 1, flexBasis: 0 }}>
            <GraficoFlujos flujos={r.flujos} />
            <View style={{ ...s.fila, gap: 10, marginTop: 3 }}>
              <Leyenda color={C.acento} texto="Cupones" />
              <Leyenda color={C.dorado} texto="Capital" />
              <Text style={s.src}>Total {mill(c.totalPagos)}</Text>
            </View>
          </Seccion>
          <Seccion titulo="Frente a un CDT al mismo plazo" style={{ flexGrow: 1, flexBasis: 0 }}>
            {r.cdt ? (
              <View style={s.caja}>
                <KV
                  filas={[
                    [`Este título (${nf(0).format(r.cdt.plazoDias)} días)`, mill(r.cdt.bono)],
                    [`CDT a ${pct(r.cdt.tasaCDT)} E.A.`, mill(r.cdt.cdt)],
                  ]}
                />
                <Text style={{ marginTop: 6, fontWeight: 600, color: r.cdt.ganaBono ? C.positivo : C.negativo }}>
                  {r.cdt.ganaBono ? "Gana " : "Pierde "}
                  {mill(Math.abs(r.cdt.diferencia))} {r.cdt.ganaBono ? "más que" : "frente a"} el CDT.
                </Text>
              </View>
            ) : (
              <Text style={{ color: C.tinta2 }}>Sin tasa de CDT para comparar.</Text>
            )}
          </Seccion>
        </View>

        {r.carry && (
          <Seccion titulo={`Carry y fondeo · ${r.carry.tipo}`} style={{ marginTop: 14 }}>
            <View style={{ ...s.fila, gap: 8 }}>
              {[
                ["Tasa del fondeo", pct(r.carry.tasaEA, 3) + " E.A."],
                [`Fondeado (${pct(r.carry.pctFondeado, 0)})`, mill(r.carry.fondeado)],
                ["Carry diario", F.mill(r.carry.carryDia, 4)],
                ["Carry 365 días", mill(r.carry.horizontes[2].carry)],
                ["ROE 365 días", pct(r.carry.horizontes[2].roe)],
                ["Colchón con fondeo", nf(0).format(r.carry.horizontes[2].colchonPb) + " pb"],
              ].map(([l, v]) => (
                <View key={l} style={{ ...s.caja, flexGrow: 1, flexBasis: 0, padding: 7 }}>
                  <Text style={{ fontSize: 7, color: C.tinta2 }}>{l}</Text>
                  <Text style={{ ...s.mono, fontWeight: 500, fontSize: 9, marginTop: 2 }}>{v}</Text>
                </View>
              ))}
            </View>
          </Seccion>
        )}

        <Pie fuentes={r.fuentes} generado={generado} />
      </Page>
      {pyg ? <PaginaPyG d={pyg} titulo={r.titulo} valoracion={r.valoracion} cliente={r.cliente} fuentes={r.fuentes} generado={generado} /> : null}
    </Document>
  );
}
