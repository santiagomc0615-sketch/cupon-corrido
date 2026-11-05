"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { Aviso, Kpi, Panel } from "@/components/ui";
import { TYPE_CLR, TYPE_LBL } from "@/lib/calculadora";
import type { TipoBono } from "@/lib/engine";
import { F, nf, pctAx } from "@/lib/format";
import { useHidratado } from "@/lib/storage";

export function VistaPortafolio() {
  const { pfDate, setPfDate, setPf, snap, toast, pfEjemplo } = useApp();
  const hidratado = useHidratado();
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

  return (
    <>
      {isEx && (
        <Aviso etiqueta="Ejemplo">
          Posiciones de ejemplo con los títulos del Excel. Agrega las tuyas desde la calculadora o elimínalas aquí. Se
          guardan solo en este navegador.
        </Aviso>
      )}
      <div className="kpis k3">
        <Kpi l="Valor de mercado" v={F.copM(m.mv)} s={`${m.n} títulos · giro sucio`} />
        <Kpi l="TIR ponderada (pesos)" v={F.pct(m.ytm, 2)} s="UVR convertida a pesos" />
        <Kpi l="Duración modificada" v={F.n(m.mod, 3)} s={`Macaulay ${F.n(m.mac, 2)} años`} />
        <Kpi l="DV01 total" v={F.copM(m.dv01)} s="por 1 pb paralelo" />
        <Kpi l="Convexidad" v={F.n(m.conv, 2)} s="ponderada por valor" />
        <Kpi l="Spread vs. TES a su duración" v={F.bp((m.ytm - z(m.mac)) * 1e4)} s={`TES cero ${F.pct(z(m.mac), 2)}`} />
      </div>
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

      <div className="grid-c g2">
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
          <h3 style={{ margin: "20px 0 8px" }}>Escalera de flujos en pesos</h3>
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
        <Panel titulo="Pruebas de estrés de tasa" src="Revaloración completa · Δ valor">
          <Chart
            series={[]}
            bars={{ data: m.stress.map((s) => [s[0], s[1] / 1e6]) }}
            yf={(v) => nf(0).format(v) + "M"}
            label="Pruebas de estrés"
            pl={56}
            tip={(x) => {
              const i = Math.round(x),
                s = m.stress[i];
              if (!s) return null;
              return {
                x: i,
                y: s[1] / 1e6,
                content: (
                  <>
                    {s[0]}
                    <br />
                    {F.copM(s[1])} · {F.pct(s[1] / m.mv, 2)}
                  </>
                ),
              };
            }}
          />
          <p className="src" style={{ marginTop: 8 }}>
            Empinamiento: tasas cortas −, largas + (0,15 pb por cada año de duración frente a 3 años). Aplanamiento: lo
            contrario.
          </p>
        </Panel>
      </div>

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
    </>
  );
}
