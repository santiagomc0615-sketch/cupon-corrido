"use client";
/* Inflación implícita por referencia TES UVR frente a la meta del BanRep y a las expectativas.
   Las TIR reales de los TES UVR no tienen una fuente gratuita en línea (el BanRep solo publica la
   curva cero cupón UVR en descargas de su sitio), así que se cargan en CSV o se editan aquí, con
   fecha y fuente; se guardan en el navegador. Cálculos en lib/analisis/inflacion-implicita.ts. */
import { useMemo, useState } from "react";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { Kpi, Panel } from "@/components/ui";
import {
  aCSV,
  expectativaPromedio,
  horizonteEncuesta,
  inflacionImplicita,
  lecturaImplicita,
  leerCSVUVR,
  META_INFLACION,
  TEXTO_SENAL,
  UMBRAL_PB,
  type DatosUVR,
  type RefUVR,
} from "@/lib/analisis/inflacion-implicita";
import { toN } from "@/lib/engine";
import { F, nf, pctAx } from "@/lib/format";
import { useGuardado } from "@/lib/storage";

/** Referencias de ejemplo (ilustrativas, no de mercado) para que la sección no aparezca vacía. */
const EJEMPLO: RefUVR[] = [
  { titulo: "TES UVR 2027", vencimiento: "2027-03-25", tirReal: 0.051 },
  { titulo: "TES UVR 2029", vencimiento: "2029-04-18", tirReal: 0.054 },
  { titulo: "TES UVR 2033", vencimiento: "2033-02-23", tirReal: 0.056 },
  { titulo: "TES UVR 2035", vencimiento: "2035-04-25", tirReal: 0.057 },
  { titulo: "TES UVR 2037", vencimiento: "2037-02-25", tirReal: 0.0575 },
];

const CLASE_SENAL = { uvr: "warn", tf: "pos", neutral: "" } as const;

export function InflacionImplicita() {
  const { snap, mk } = useApp();
  const inicial = useMemo<DatosUVR>(() => {
    const u = snap.datos.curvaUVR;
    if (u?.tes.length)
      return {
        fecha: u.fecha,
        fuente: snap.fuentes.tesuvr?.fuente ?? "Cargado en /datos",
        refs: u.tes.map((r) => ({ titulo: r[0], vencimiento: r[1], tirReal: r[3] })),
      };
    return { fecha: snap.datos.curveDate, fuente: "Ejemplo ilustrativo", refs: EJEMPLO, ejemplo: true };
  }, [snap]);
  const [guardados, guardar] = useGuardado<DatosUVR | null>("inflacionImplicita-v1", null);
  const d = guardados ?? inicial;
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [editar, setEditar] = useState(false);

  const cambiar = (x: Partial<DatosUVR>) => guardar({ ...d, ...x, ejemplo: false });
  const cambiarRef = (i: number, x: Partial<RefUVR>) => cambiar({ refs: d.refs.map((r, j) => (j === i ? { ...r, ...x } : r)) });

  const refsTF = useMemo(() => mk.tesSorted.map((r) => [r[4], r[3]] as [number, number]), [mk]);
  const { fecha, refs } = d;
  const { filas, resumen } = useMemo(() => {
    const validas = refs.filter((r) => toN(r.vencimiento) > toN(fecha) && Number.isFinite(r.tirReal));
    return lecturaImplicita(inflacionImplicita(refsTF, { fecha, refs: validas }), snap.datos.exp, fecha);
  }, [refsTF, fecha, refs, snap.datos.exp]);

  const leer = async (archivo: File) => {
    setError(null);
    const r = leerCSVUVR(await archivo.text());
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setAvisos(r.avisos);
    guardar({ fecha: r.fecha ?? d.fecha, fuente: r.fuente ?? `Archivo ${archivo.name}`, refs: r.refs });
  };
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([aCSV(d)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tes-uvr-${d.fecha}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const imp: PuntoSerie[] = filas.map((f) => [f.plazo, f.implicita]);
  const tMax = Math.max(...filas.map((f) => f.plazo), 2);
  const expCurva: PuntoSerie[] = [];
  for (let t = 0.5; t <= tMax + 1e-9; t += 0.5) {
    const e = expectativaPromedio(snap.datos.exp, d.fecha, t);
    if (e != null) expCurva.push([t, e]);
  }
  const meta: PuntoSerie[] = [
    [0, META_INFLACION.centro],
    [tMax, META_INFLACION.centro],
  ];
  const desfase = Math.abs(toN(d.fecha) - toN(snap.datos.curveDate));
  const horizonte = horizonteEncuesta(snap.datos.exp, d.fecha);
  const media = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const fuenteExp = snap.fuentes.exp;

  return (
    <Panel titulo="Inflación implícita" src={`TES TF ${F.date(snap.datos.curveDate)} · TES UVR ${F.date(d.fecha)} (${d.fuente})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="src" style={{ fontSize: 13 }}>
          Para cada TES UVR: <span className="mono">(1 + TIR TES TF) / (1 + TIR real TES UVR) − 1</span>, con la TIR tasa fija
          interpolada al plazo del UVR. Es la inflación que hace indiferente un título del otro.
        </p>
        {d.ejemplo && (
          <div className="alert" role="status">
            Estas TIR reales son un <b>ejemplo ilustrativo</b>, no datos de mercado. Cargue las del día (SEN, proveedor de precios
            o la curva cero cupón UVR del BanRep) con el CSV o edítelas abajo.
          </div>
        )}
        {desfase > 5 && (
          <div className="alert">
            Las tasas UVR ({F.date(d.fecha)}) y la curva tasa fija ({F.date(snap.datos.curveDate)}) son de fechas distintas
            ({desfase} días): la implícita mezcla dos momentos del mercado.
          </div>
        )}

        <div className="kpis k4">
          <Kpi l="Implícita promedio" v={F.pct(media(filas.map((f) => f.implicita)), 2)} s={`${filas.length} referencias UVR`} />
          <Kpi l="Expectativa promedio" v={F.pct(media(filas.map((f) => f.expectativa)), 2)} s={`Encuesta · ${fuenteExp?.fuente ?? "BanRep"}`} />
          <Kpi l="Brecha media" v={resumen ? F.bp(resumen.brechaMedia) : "—"} s="Implícita − expectativa" />
          <Kpi l="Meta BanRep" v="3 % ± 1" s={resumen ? `${resumen.fueraDeRango} de ${filas.length} fuera del rango` : "2 % a 4 %"} />
        </div>

        {resumen && (
          <div className={`lectura-ii ${resumen.senal}`}>
            <span className={`chip ${CLASE_SENAL[resumen.senal]}`}>
              <span className="dot" />
              {TEXTO_SENAL[resumen.senal]}
            </span>
            <p>{resumen.texto}</p>
            <p className="src">
              {resumen.aFavorUVR} referencia(s) a favor de UVR/IPC, {resumen.aFavorTF} a favor de tasa fija y {resumen.neutrales} en
              línea (brecha dentro de ±{UMBRAL_PB} pb). La implícita también incluye primas por riesgo inflacionario y por liquidez
              (los TES UVR son menos líquidos): no es solo expectativa. Lectura académica, no es asesoría financiera.
            </p>
          </div>
        )}

        {imp.length > 0 ? (
          <>
            <Chart
              series={[
                { data: imp, cls: "s-a", points: "pt-a", labels: false },
                { data: expCurva, cls: "s-c" },
                { data: meta, cls: "s-d" },
              ]}
              band={[META_INFLACION.min, META_INFLACION.max]}
              xmin={0}
              yf={pctAx(1)}
              xf={(v) => v + "a"}
              label="Inflación implícita por plazo de cada TES UVR, expectativa promedio de la encuesta y meta del BanRep con su rango"
              tip={(x) => {
                const p = nearest(imp, x);
                const f = filas.find((r) => r.plazo === p[0]);
                return {
                  x: p[0],
                  y: p[1],
                  content: (
                    <>
                      {f?.titulo} · {F.n(p[0], 1)} años
                      <br />
                      Implícita {F.pct(p[1], 2)}
                      {f?.expectativa != null ? <> · Expectativa {F.pct(f.expectativa, 2)}</> : null}
                    </>
                  ),
                };
              }}
            />
            <div className="legend">
              <span>
                <i />
                Inflación implícita (por TES UVR)
              </span>
              <span>
                <i className="c" />
                Expectativa promedio al plazo
              </span>
              <span>
                <i className="d" />
                Meta 3 %
              </span>
              <span>
                <i className="e" style={{ height: 8, opacity: 0.3 }} />
                Rango 2–4 %
              </span>
            </div>
          </>
        ) : (
          <p className="alert">No hay referencias UVR vigentes para calcular. Agregue al menos una con vencimiento posterior a la fecha.</p>
        )}

        <div className="tbl" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Vence</th>
                <th>Plazo</th>
                <th>TIR real UVR</th>
                <th>TIR TES TF</th>
                <th>Implícita</th>
                <th>Expectativa</th>
                <th>Brecha</th>
                <th>Lectura</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.titulo + f.vencimiento}>
                  <td>{f.titulo}</td>
                  <td>{F.date(f.vencimiento)}</td>
                  <td>{F.n(f.plazo, 2)}</td>
                  <td>{F.pct(f.tirReal, 3)}</td>
                  <td>
                    {F.pct(f.tirTF, 3)}
                    {f.extrapolado ? " *" : ""}
                  </td>
                  <td>{F.pct(f.implicita, 2)}</td>
                  <td>{F.pct(f.expectativa, 2)}</td>
                  <td>{F.bp(f.brechaPb)}</td>
                  <td>{f.senal ? TEXTO_SENAL[f.senal].replace(" relativamente más atractivos", "").replace(" relativamente más atractiva", "") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="src">
          {filas.some((f) => f.extrapolado) ? "* Fuera de las referencias tasa fija: se usa la TIR del extremo de la curva. " : ""}
          Expectativa: promedio geométrico de la inflación anual esperada entre hoy y el plazo (encuesta del BanRep,{" "}
          {fuenteExp?.fuente ?? "—"}). La encuesta llega hasta {nf(1).format(horizonte)} años; más allá se mantiene su último
          dato. Tasa fija: referencias TES del {F.date(snap.datos.curveDate)} ({snap.fuentes.tes?.fuente ?? "—"}).
        </p>

        <div className="ii-datos">
          <div className="ii-barra">
            <div className="f">
              <label htmlFor="ii-csv">Cargar TES UVR (CSV: título; vencimiento; TIR real en %; filas opcionales «fecha;…» y «fuente;…»)</label>
              <input id="ii-csv" type="file" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && void leer(e.target.files[0])} />
            </div>
            <div className="ii-acciones">
              <button type="button" className="btn" onClick={() => setEditar(!editar)} aria-expanded={editar}>
                {editar ? "Cerrar edición" : "Editar a mano"}
              </button>
              <button type="button" className="btn" onClick={descargar}>
                Descargar CSV
              </button>
              {guardados && (
                <button type="button" className="btn" onClick={() => guardar(null)}>
                  Restaurar
                </button>
              )}
            </div>
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {avisos.map((a) => (
            <p key={a} className="src">
              {a}
            </p>
          ))}
          {editar && (
            <div className="ii-editor">
              <div className="ii-meta">
                <div className="f">
                  <label htmlFor="ii-fecha">Fecha de las tasas</label>
                  <input id="ii-fecha" type="date" value={d.fecha} onChange={(e) => e.target.value && cambiar({ fecha: e.target.value })} />
                </div>
                <div className="f">
                  <label htmlFor="ii-fuente">Fuente</label>
                  <input id="ii-fuente" type="text" maxLength={120} value={d.fuente} onChange={(e) => cambiar({ fuente: e.target.value })} />
                </div>
              </div>
              <div className="tbl" style={{ maxHeight: "none" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Vencimiento</th>
                      <th>TIR real (%)</th>
                      <th>
                        <span className="sr-only">Quitar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.refs.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input className="ii-in" aria-label={`Título ${i + 1}`} value={r.titulo} maxLength={60} onChange={(e) => cambiarRef(i, { titulo: e.target.value })} />
                        </td>
                        <td>
                          <input className="ii-in" type="date" aria-label={`Vencimiento ${i + 1}`} value={r.vencimiento} onChange={(e) => e.target.value && cambiarRef(i, { vencimiento: e.target.value })} />
                        </td>
                        <td>
                          <input
                            className="ii-in num"
                            type="number"
                            step="0.001"
                            aria-label={`TIR real ${i + 1}`}
                            value={Number((r.tirReal * 100).toFixed(4))}
                            onChange={(e) => e.target.value !== "" && cambiarRef(i, { tirReal: Math.round(Number(e.target.value) * 1e6) / 1e8 })}
                          />
                        </td>
                        <td>
                          <button type="button" className="btn ii-quitar" onClick={() => cambiar({ refs: d.refs.filter((_, j) => j !== i) })} aria-label={`Quitar ${r.titulo}`}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => cambiar({ refs: [...d.refs, { titulo: "TES UVR", vencimiento: d.refs[d.refs.length - 1]?.vencimiento ?? d.fecha, tirReal: 0.05 }] })}
              >
                Agregar referencia
              </button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
