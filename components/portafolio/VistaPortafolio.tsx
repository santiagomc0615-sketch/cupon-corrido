"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarrasH } from "@/components/charts/BarrasH";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { ClientePortafolio, InterruptorCliente, useVistaCliente } from "@/components/cliente/Interruptor";
import { BotonPyGPortafolio } from "@/components/pyg/Botones";
import { RetornoPortafolio, RetornoPosiciones } from "@/components/analisis/RetornoHorizonte";
import { Contador } from "@/components/cliente/Contador";
import { Comparador } from "@/components/pyg/Comparador";
import { PyGPortafolio } from "@/components/pyg/PyGPortafolio";
import { Pestanas, SiguientePaso, SiguientesPasos } from "@/components/ui/Pestanas";
import { resumenPortafolio } from "@/lib/cliente";
import { BotonReportePortafolio } from "@/components/reporte/BotonReporte";
import { EscenarioBanRep } from "./EscenarioBanRep";
import { FondeoPortafolio } from "./FondeoPortafolio";
import { Aviso, Kpi, Panel } from "@/components/ui";
import { TYPE_CLR, TYPE_LBL } from "@/lib/calculadora";
import type { TipoBono } from "@/lib/engine";
import { F, nf, pctAx } from "@/lib/format";
import { useHidratado } from "@/lib/storage";

export function VistaPortafolio() {
  const { pfDate, setPfDate, setPf, snap, toast, pfEjemplo } = useApp();
  const hidratado = useHidratado();
  const [cliente] = useVistaCliente();
  return (
    <section className="view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow">Gestión de posiciones</span>
          <h1>
            Mi <em>portafolio</em>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <InterruptorCliente />
          <div className="f">
            <label htmlFor="pfDate">Fecha de valoración</label>
            <input
              type="date"
              id="pfDate"
              value={hidratado ? pfDate : snap.fechaAnalisis}
              onChange={(e) => setPfDate(e.target.value || snap.fechaAnalisis)}
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPf(pfEjemplo);
              toast("Portafolio de ejemplo restaurado");
            }}
          >
            Restaurar ejemplo
          </button>
          <Link className="btn primary" href="/calculadora">
            + Agregar título
          </Link>
        </div>
      </div>
      {hidratado && !cliente && (
        <div className="reporte-barra">
          <BotonPyGPortafolio />
          <BotonReportePortafolio />
        </div>
      )}
      {hidratado && cliente && <ClientePortafolio />}
      {hidratado ? <Cuerpo /> : <div className="panel empty">Cargando portafolio…</div>}
    </section>
  );
}

function Cuerpo() {
  const { pf, setPf, pfDate, pfValorado: V, pfMetricas: m, motor, mk, setCalc, setEditingId, toast } = useApp();
  const router = useRouter();
  const z = motor.spot;

  if (!V.length || !m) {
    return (
      <div className="panel empty">
        <h2 style={{ marginBottom: 6 }}>Tu portafolio está vacío</h2>
        <p>Valora un título en la calculadora y pulsa «Agregar al portafolio».</p>
        <p style={{ marginTop: 14 }}>
          <Link className="btn primary" href="/calculadora">
            Ir a la calculadora
          </Link>
        </p>
      </div>
    );
  }

  const types = Object.entries(m.byType) as [TipoBono, number][];
  const isEx = pf.some((p) => p.ejemplo);
  const alertas: string[] = [];
  types.forEach(([k, v]) => {
    if (v / m.mv > 0.5) alertas.push(`Concentración: ${TYPE_LBL[k]} pesa ${F.pct(v / m.mv, 1)} del portafolio.`);
  });
  if (m.mod > 5) alertas.push(`Duración modificada de ${F.n(m.mod, 2)}: un alza de 100 pb restaría cerca de ${F.pct(m.mod / 100, 1)} del valor.`);
  const omitidas = pf.length - V.length;

  const eliminar = (id: string) => {
    setPf((x) => x.filter((p) => p.id !== id));
    toast("Posición eliminada");
  };
  const editar = (id: string) => {
    const p = pf.find((x) => x.id === id);
    if (!p) return;
    setCalc((c) => ({ ...c, type: p.inputs.tipo, inputs: { ...c.inputs, [p.inputs.tipo]: JSON.parse(JSON.stringify(p.inputs)) } }));
    setEditingId(p.id);
    router.push("/calculadora");
  };

  const ld = m.ladder.map(([y, v]) => [y, v.TF + v.IBR + v.IPC + v.UVR] as [string, number]);
  const pts: PuntoSerie[] = V.map((x) => [x.o.mac, x.o.yieldCOP, x.p.inputs.nombre.replace(" (ejemplo)", "")]);

  const resumen = resumenPortafolio(V.map((x) => ({ b: x.b, o: x.o, titulo: String(x.p.inputs.nombre) })));
  const pc = resumen?.proximo ?? null;

  return (
    <>
      {isEx && (
        <Aviso etiqueta="Ejemplo">
          Posiciones de ejemplo con los títulos del Excel. Agrega las tuyas desde la calculadora o elimínalas aquí. Se
          guardan solo en este navegador.
        </Aviso>
      )}
      <section className="resumen" aria-label="Resumen del portafolio">
        <div className="r-cifra r-heroe">
          <span className="r-etq">Valor del portafolio</span>
          <span className="r-valor">
            <Contador valor={m.mv} formato={(v) => F.copM(v)} />
          </span>
          <span className="r-nota">{`${m.n} títulos · giro sucio al ${F.date(pfDate)}`}</span>
        </div>
        <div className="resumen-apoyo">
          <div className="r-cifra">
            <span className="r-etq">TIR ponderada (pesos)</span>
            <span className="r-valor">
              <Contador valor={m.ytm} formato={(v) => F.pct(v, 2)} />
            </span>
            <span className="r-nota">UVR convertida a pesos</span>
          </div>
          <div className="r-cifra">
            <span className="r-etq">Ganancia al año</span>
            <span className="r-valor">{resumen ? <Contador valor={resumen.gananciaAnual} formato={(v) => F.mill(v, 1)} /> : "—"}</span>
            <span className="r-nota">{resumen ? `$ ${nf(0).format(Math.round(resumen.gananciaDiaria))} cada día` : ""}</span>
          </div>
          <div className="r-cifra">
            <span className="r-etq">Próximo cupón</span>
            <span className="r-valor">{pc ? <Contador valor={pc.cop} formato={(v) => F.mill(v, 1)} /> : "—"}</span>
            <span className="r-nota">{pc ? `${F.date(pc.fecha)} · faltan ${nf(0).format(pc.dias)} días${pc.titulo ? ` · ${pc.titulo}` : ""}` : "Sin cupones pendientes"}</span>
          </div>
          <div className="r-cifra">
            <span className="r-etq">Colchón</span>
            <span className="r-valor">{resumen ? <Contador valor={resumen.colchonPb} formato={(v) => nf(0).format(v) + " pb"} /> : "—"}</span>
            <span className="r-nota">Subida de tasas que aguanta un año sin perder</span>
          </div>
        </div>
      </section>
      {alertas.map((a) => (
        <div className="alert" key={a}>
          {a}
        </div>
      ))}
      {omitidas > 0 && (
        <div className="alert">
          {omitidas === 1 ? "Una posición no se pudo valorar" : `${omitidas} posiciones no se pudieron valorar`} en la
          fecha elegida (por ejemplo, porque ya vencieron).
        </div>
      )}
      <Pestanas
        pantalla="portafolio"
        pestanas={[
          {
            id: "resumen",
            contenido: (
              <div className="pestana">
                <Panel titulo="Posiciones" src={`Valoradas al ${F.date(pfDate)} con su tasa de negociación`}>
        <div className="tbl" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Nominal</th>
                <th>Precio sucio</th>
                <th>TIR</th>
                <th>Peso</th>
                <th>D. mod</th>
                <th>DV01</th>
                <th>Valor</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {V.map((x) => (
                <tr key={x.p.id}>
                  <td className="t">{x.p.inputs.nombre}</td>
                  <td>
                    <span className="tag">{x.b.tipo}</span>
                  </td>
                  <td>
                    {x.b.tipo === "UVR" ? F.n(x.b.nominal, 0) + " UVR" : F.copM(x.b.nominal)}
                  </td>
                  <td>{F.n(x.o.dirty, 3)}</td>
                  <td>
                    {F.pct(x.o.irr, 2)}
                    {x.b.tipo === "UVR" && <span className="src"> real</span>}
                  </td>
                  <td>{F.pct(x.o.giro / m.mv, 1)}</td>
                  <td>{F.n(x.o.mod, 2)}</td>
                  <td>{F.copM(x.o.dv01)}</td>
                  <td>{F.copM(x.o.giro)}</td>
                  <td>
                    <button type="button" className="btn sm ghost" onClick={() => editar(x.p.id)}>
                      Editar
                    </button>{" "}
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => eliminar(x.p.id)}
                      aria-label={"Eliminar " + x.p.inputs.nombre}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
                <Panel titulo="Composición por indexación">
          <div className="alloc">
            {types.map(([k, v]) => (
              <div key={k} style={{ flex: v, background: TYPE_CLR[k] }} title={TYPE_LBL[k]}>
                {v / m.mv > 0.08 ? TYPE_LBL[k] + " " + nf(0).format((v / m.mv) * 100) + "%" : ""}
              </div>
            ))}
          </div>
          <div className="legend">
            {types.map(([k, v]) => (
              <span key={k}>
                <i style={{ background: TYPE_CLR[k], height: 8 }} />
                {TYPE_LBL[k]} · {F.pct(v / m.mv, 1)}
              </span>
            ))}
          </div>
          </Panel>
                <SiguientesPasos>
                  <SiguientePaso titulo="Mira el riesgo si cambian las tasas" texto="Estrés, escenario del BanRep y valor relativo" pestana="riesgo" />
                  <SiguientePaso titulo="Agrega otro título" texto="Valóralo en la calculadora" href="/calculadora" />
                </SiguientesPasos>
              </div>
            ),
          },
          {
            id: "riesgo",
            contenido: (
              <div className="pestana">
                <div className="kpis k4 riesgo-kpis">
                  <Kpi l="Duración modificada" v={F.n(m.mod, 3)} s={`Macaulay ${F.n(m.mac, 2)} años`} />
                  <Kpi l="DV01 total" v={F.copM(m.dv01)} s="por 1 pb paralelo" />
                  <Kpi l="Convexidad" v={F.n(m.conv, 2)} s="ponderada por valor" />
                  <Kpi l="Spread vs. TES a su duración" v={F.bp((m.ytm - z(m.mac)) * 1e4)} s={`TES cero ${F.pct(z(m.mac), 2)}`} />
                </div>
                <Panel titulo="Pruebas de estrés de tasa" src="Revaloración completa · Δ valor">
          <BarrasH
            label="Pruebas de estrés: cambio de valor del portafolio"
            filas={m.stress.map(([nombre, d]) => ({
              etiqueta: nombre,
              valor: d,
              texto: F.copM(d),
              sub: F.pct(d / m.mv, 2) + " del valor",
              descripcion: `${nombre}: ${F.copM(d)}, ${F.pct(d / m.mv, 2)} del valor`,
            }))}
          />
          <p className="src" style={{ marginTop: 8 }}>
            Empinamiento: tasas cortas −, largas + (0,15 pb por cada año de duración frente a 3 años). Aplanamiento: lo
            contrario.
          </p>
        </Panel>
                <EscenarioBanRep />
                <Panel titulo="Posiciones frente a la curva TES" src="Duración vs. TIR en pesos · encima de la curva = paga prima sobre el soberano">
        <Chart
          series={[
            { data: mk.curva.zs, cls: "s-a" },
            { data: pts, pointsOnly: true, points: "pt-b", labels: true, r: 5 },
          ]}
          xmin={0}
          yf={pctAx(0)}
          xf={(v) => v + "a"}
          label="Valor relativo frente a la curva TES"
          tip={(x) => {
            const p = nearest(pts, x);
            return {
              x: p[0],
              y: p[1],
              content: (
                <>
                  {p[2]}
                  <br />
                  Duración {F.n(p[0], 2)} · TIR {F.pct(p[1], 2)}
                  <br />
                  Spread {F.bp((p[1] - z(p[0])) * 1e4)}
                </>
              ),
            };
          }}
        />
      </Panel>
                <SiguientesPasos>
                  <SiguientePaso titulo="Mira lo que vas a recibir" texto="Cupones y capital por año" pestana="flujos" />
                </SiguientesPasos>
              </div>
            ),
          },
          {
            id: "flujos",
            contenido: (
              <div className="pestana">
                <Panel titulo="Flujos: escalera en pesos" src="Cupones y capital que recibe cada año">
          <Chart
            series={[]}
            bars={{ data: ld.map((d) => [d[0], d[1] / 1e9, "bar-pos"]) }}
            ymin={0}
            yf={(v) => nf(1).format(v)}
            label="Escalera de flujos en miles de millones"
            h={200}
            tip={(x) => {
              const i = Math.round(x),
                r = m.ladder[i];
              if (!r) return null;
              return {
                x: i,
                y: ld[i][1] / 1e9,
                content: (
                  <>
                    {r[0]} · {F.copM(ld[i][1])}
                    {(Object.entries(r[1]) as [TipoBono, number][])
                      .filter((e) => e[1])
                      .map((e) => (
                        <span key={e[0]}>
                          <br />
                          {TYPE_LBL[e[0]]} {F.copM(e[1])}
                        </span>
                      ))}
                  </>
                ),
              };
            }}
          />
          <p className="src" style={{ marginTop: 6 }}>
            Miles de millones de pesos por año.
          </p>
        </Panel>
                <SiguientesPasos>
                  <SiguientePaso titulo="¿Y si lo fondeas?" texto="Carry del portafolio y fondeo en pesos o dólares" pestana="carry" />
                </SiguientesPasos>
              </div>
            ),
          },
          {
            id: "carry",
            contenido: (
              <div className="pestana">
                <FondeoPortafolio />
                <RetornoPortafolio />
                <SiguientesPasos>
                  <SiguientePaso titulo="Mira tu P&G si vendes" texto="Con impuestos e inflación" pestana="venta" />
                </SiguientesPasos>
              </div>
            ),
          },
          {
            id: "venta",
            contenido: (
              <div className="pestana">
                <PyGPortafolio />
                <Comparador />
                <SiguientesPasos>
                  <SiguientePaso titulo="Mira el retorno esperado por posición" texto="Causación, roll-down y fondeo a 365 días" pestana="analisis" />
                  <SiguientePaso titulo="Pregúntale al asesor" texto="Con tu perfil de cliente y tributario" href="/asesor" />
                </SiguientesPasos>
              </div>
            ),
          },
          {
            id: "analisis",
            contenido: (
              <div className="pestana">
                <RetornoPosiciones />
                <SiguientesPasos>
                  <SiguientePaso titulo="Pregúntale al asesor" texto="Un análisis con las cifras del motor" href="/asesor" />
                  <SiguientePaso titulo="Descarga el reporte PDF" texto="Botón arriba de la página" onClick={() => window.scrollTo({ top: 0 })} />
                </SiguientesPasos>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

