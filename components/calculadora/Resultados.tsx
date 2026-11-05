"use client";
import type { ReactNode } from "react";
import { Chart, nearest } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { KV, Panel } from "@/components/ui";
import {
  edate,
  esError,
  holding,
  pvAt,
  toN,
  toS,
  type Bono,
  type FilaCronograma,
  type ResultadoValoracion,
  type TipoBono,
  type Valoracion,
} from "@/lib/engine";
import { F, nf } from "@/lib/format";

export function Resultados({ b, o }: { b: Bono; o: Valoracion }) {
  if (esError(o)) {
    return (
      <div>
        <div className="alert">{o.error}</div>
      </div>
    );
  }
  return <ResultadosOk b={b} o={o} />;
}

function ResultadosOk({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  const t = o.tipo,
    fx = o.fx;

  const head: [string, string, string][] = [
    ["Precio sucio", F.n(o.dirty, 3) + " %", "Compra · truncado a 3 dec."],
    ["Precio limpio", F.n(o.clean, 3) + " %", o.cond],
    [
      "TIR " + (t === "UVR" ? "real" : "E.A."),
      F.pct(o.irr, 3),
      o.tipo === "UVR" ? "En pesos ≈ " + F.pct(o.tirPesos, 2) : "Nominal " + F.pct(o.nom, 3),
    ],
    ["Duración mod.", F.n(o.mod, 3), "Macaulay " + F.n(o.mac, 3) + " años"],
    ["DV01", F.copM(o.dv01), "por 1 pb de tasa"],
  ];

  const avisos: string[] = [];
  if (o.aviso) avisos.push(o.aviso);
  if (o.tipo === "IBR" && o.ibrStale)
    avisos.push(`La fecha de valoración es posterior al último IBR cargado (${F.date(o.ibrFecha)}); se usa ese último dato publicado.`);
  if (o.tipo === "IBR" && o.fracStale)
    avisos.push(`La curva FRAC cargada es del ${F.date(o.fracStart)}: actualízala para valorar en esta fecha.`);
  if (o.tipo === "UVR" && o.uvrExtrap) avisos.push("La UVR de la fecha de valoración se extrapoló con el IPC vigente.");

  let spec: [ReactNode, ReactNode, ReactNode?][] = [];
  if (o.tipo === "TF")
    spec = [
      ["Rendimiento corriente", F.pct(o.rendCorriente, 3)],
      ["Precio teórico con curva cero TES", F.n(o.pCurve, 3) + " %"],
      ["TIR equivalente al precio de curva", F.pct(o.irrCurve, 3)],
      ["Spread sobre curva TES", F.bp(o.spreadCurve)],
    ];
  if (o.tipo === "IPC")
    spec = [
      ["IPC vigente (" + o.ipcMes.slice(0, 7) + ")", F.pct(o.ipcVig, 3)],
      ["Tasa de negociación (1+IPC)(1+s)−1", F.pct(o.tasaNeg, 3), F.pct(o.tasaNegV, 3)],
      ["TIR real", F.pct(o.tirReal, 3), F.pct(o.tirRealV, 3)],
      ["Tasa cupón periodo vigente", F.pct(o.tasaCupVig, 3)],
    ];
  if (o.tipo === "IBR")
    spec = [
      [o.plazoIBR + " vigente (" + o.ibrFecha + ")", F.pct(o.ibrVig, 3)],
      ["Tasa negociación IBR+spread (N.A.)", F.pct(o.tasaNeg, 3), F.pct(o.tasaNegV, 3)],
      ["Equivalente E.A.", F.pct(o.tasaNegEA, 3), F.pct(o.tasaNegEAV, 3)],
      ["IBR promedio proyectado", F.pct(o.ibrAvg, 3)],
    ];
  if (o.tipo === "UVR")
    spec = [
      ["UVR a la valoración (" + o.uvrFecha + ")", F.n(o.uvr, 4)],
      ["TIR en pesos (UVR proyectada)", F.pct(o.tirPesos, 3)],
      ["Fisher (1+TIR)(1+IPC)−1", F.pct(o.fisher, 3)],
      ["Spread TIR UVR vs TES TF a su duración", F.bp(o.spreadUVR)],
      ["Spread TIR pesos vs TES TF", F.bp(o.spreadPesos)],
    ];

  // Curva de sensibilidad cada 10 pb
  const sens: [number, number, number, number][] = [];
  for (let bp = -300; bp <= 300; bp += 10) {
    const r = o.irr + bp / 1e4,
      dy = bp / 1e4;
    sens.push([bp, pvAt(o.flows, r), o.dirty * (1 - o.mod * dy), o.dirty * (1 - o.mod * dy + 0.5 * o.conv * dy * dy)]);
  }
  const fut = o.rows.filter((r) => r.N > 0);
  const barras = fut.map((r): [string, number, string] => [toS(r.pay).slice(2, 7).replace("-", "/"), r.L, r.last ? "bar-b" : "bar-pos"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      <div className="headline">
        {head.map((h) => (
          <div className="kpi" key={h[0]}>
            <span className="l">{h[0]}</span>
            <span className="v">{h[1]}</span>
            <span className="s">{h[2]}</span>
          </div>
        ))}
      </div>
      {avisos.map((w) => (
        <div className="alert" key={w}>
          {w}
        </div>
      ))}
      <div className="grid-c g2">
        <Panel titulo="Valoración" src={`${o.cupones} cupones · ${o.pendientes} pendientes · ${F.n(o.plazo, 3)} años`}>
          <KV
            heads={["", "Compra", "Venta"]}
            rows={[
              ["Tasa de negociación", F.pct(o.irr, 3), F.pct(o.irrV, 3)],
              ["Precio sucio", F.n(o.dirty, 3) + " %", F.n(o.dirtyV, 3) + " %"],
              ["Cupón corrido", F.n(o.accrued, 4) + " %", F.n(o.accrued, 4) + " %"],
              ["Precio limpio", F.n(o.clean, 3) + " %", F.n(o.cleanV, 3) + " %"],
              ["Valor de giro", F.cop(o.giro), F.cop(o.giroV)],
              ["Cupón corrido $", F.cop(o.corridoCOP), ""],
              ["Condición", o.cond, o.condV],
              ["Diferencia de giro venta − compra", F.cop(o.difGiro), ""],
            ]}
          />
        </Panel>
        <Panel titulo="Riesgo y rentabilidad" src={`Último cupón ${F.date(o.ultimo)} · próximo ${F.date(o.proximo)}`}>
          <KV
            rows={[
              ["Duración Macaulay", F.n(o.mac, 4) + " a", F.n(o.macDays, 0) + " días"],
              ["Duración modificada", F.n(o.mod, 4), ""],
              ["Duración en pesos (pts por 100 pb)", F.n(o.durPesos, 4), ""],
              ["Duración $ de la posición (100 pb)", F.copM(o.durPos), ""],
              ["DV01", F.cop(o.dv01), ""],
              ["Convexidad", F.n(o.conv, 3), ""],
              ...spec,
            ]}
          />
        </Panel>
      </div>

      <Panel titulo="Sensibilidad precio–rendimiento" src="Real vs. aproximación por duración y por duración + convexidad">
        <Chart
          series={[
            { data: sens.map((s) => [s[0], s[1]]), cls: "s-a" },
            { data: sens.map((s) => [s[0], s[2]]), cls: "s-c" },
            { data: sens.map((s) => [s[0], s[3]]), cls: "s-b" },
            { data: [[0, pvAt(o.flows, o.irr)]], cls: "s-a", pointsOnly: true, points: "pt-a", r: 4.5 },
          ]}
          yf={(v) => nf(0).format(v)}
          xf={(v) => (v > 0 ? "+" : "") + v}
          label="Sensibilidad"
          xticks={() => [-300, -200, -100, 0, 100, 200, 300]}
          tip={(x) => {
            const s = nearest(sens, x);
            return {
              x: s[0],
              y: s[1],
              content: (
                <>
                  {s[0] > 0 ? "+" : ""}
                  {s[0]} pb · TIR {F.pct(o.irr + s[0] / 1e4, 2)}
                  <br />
                  Real {F.n(s[1], 3)} · D* {F.n(s[2], 3)} · D*+C {F.n(s[3], 3)}
                </>
              ),
            };
          }}
        />
        <div className="legend">
          <span>
            <i />
            Precio real
          </span>
          <span>
            <i className="c" />
            Solo D*
          </span>
          <span>
            <i className="b" />
            D* + convexidad
          </span>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>Tabla de sensibilidad</summary>
          <div className="tbl" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Δ tasa</th>
                  <th>Tasa</th>
                  <th>Precio real</th>
                  <th>Solo D*</th>
                  <th>D*+C</th>
                  <th>Error D*</th>
                  <th>Error D*+C</th>
                  <th>Δ valor posición</th>
                </tr>
              </thead>
              <tbody>
                {o.sens.map((s) => (
                  <tr key={s.bp} className={s.bp === 0 ? "zero" : ""}>
                    <td>
                      {s.bp > 0 ? "+" : ""}
                      {s.bp} pb
                    </td>
                    <td>{F.pct(s.r, 3)}</td>
                    <td>{F.n(s.real, 3)}</td>
                    <td>{F.n(s.eD, 3)}</td>
                    <td>{F.n(s.eDC, 3)}</td>
                    <td>{F.n(s.errD, 4)}</td>
                    <td>{F.n(s.errDC, 4)}</td>
                    <td style={{ color: `var(--${s.dVal >= 0 ? "pos" : "neg"})` }}>{F.copM(s.dVal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <div className="grid-c g2">
        <Panel titulo="Flujos pendientes" src="% del nominal · cupón y capital">
          <Chart
            series={[]}
            bars={{ data: barras }}
            ymin={0}
            yf={(v) => nf(0).format(v)}
            label="Flujos"
            tip={(x) => {
              const i = Math.round(x);
              const r = fut[i];
              if (!r) return null;
              return {
                x: i,
                y: r.L,
                content: (
                  <>
                    {F.date(toS(r.pay))}
                    <br />
                    Cupón {F.n(r.K, 4)}% · Flujo {F.n(r.L, 4)}%
                    <br />
                    {F.cop((r.L / 100) * b.nominal * fx)}
                  </>
                ),
              };
            }}
          />
        </Panel>
        <VentaAnticipada b={b} o={o} />
      </div>

      <div className="panel">
        <details>
          <summary>Cronograma de flujos ({o.rows.length} periodos)</summary>
          <div className="tbl" style={{ marginTop: 12 }}>
            <Cronograma rows={o.rows} t={t} />
          </div>
        </details>
      </div>
    </div>
  );
}

function VentaAnticipada({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  const { calc, setCalc } = useApp();
  const t = o.tipo;
  const d = calc.hv?.d || toS(edate(toN(b.valoracion), 12));
  const r = calc.hv?.r ?? +(o.irr * 100 - 1).toFixed(2);
  const h = holding(b, o, d, +r / 100);
  const fijar = (nd: string, nr: number | "") => setCalc((c) => ({ ...c, hv: { d: nd, r: nr === "" ? 0 : nr } }));
  return (
    <Panel titulo="Simular venta antes del vencimiento">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="f">
          <label htmlFor="hvDate">Fecha de venta</label>
          <input id="hvDate" type="date" value={d} onChange={(e) => fijar(e.target.value, r)} />
        </div>
        <div className="f">
          <label htmlFor="hvRate">
            Tasa de venta {t === "IBR" ? "(E.A. equivalente)" : t === "UVR" ? "(real E.A.)" : "(E.A.)"}
          </label>
          <div className="u">
            <input
              id="hvRate"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={r}
              onChange={(e) => fijar(d, e.target.value === "" ? "" : +e.target.value)}
            />
            <span>%</span>
          </div>
        </div>
      </div>
      {esError(h) ? (
        <div className="alert">{h.error}</div>
      ) : (
        <KV
          rows={[
            ["Precio sucio de venta", F.n(h.pVenta, 3) + " %"],
            ["Cupones recibidos", h.ncup + " · " + F.n(h.cupones, 3) + " %"],
            ["Días de tenencia", h.dias],
            ["Retorno del periodo", F.pct(h.retorno, 2)],
            ["TIR de la inversión (E.A.)", <b key="tir" style={{ color: `var(--${h.tir >= o.irr ? "pos" : "neg"})` }}>{F.pct(h.tir, 3)}</b>],
            ["Ganancia / pérdida", F.cop(h.gan)],
            ["vs. TIR de compra", F.bp((h.tir - o.irr) * 1e4)],
          ]}
        />
      )}
    </Panel>
  );
}

function Cronograma({ rows, t }: { rows: FilaCronograma[]; t: TipoBono }) {
  const extra: Record<TipoBono, [string, (r: FilaCronograma) => ReactNode]> = {
    TF: ["Tasa cupón", (r) => F.pct(r.tasa, 3)],
    IBR: ["IBR aplicado", (r) => (<>{F.pct(r.H, 3)} <span className="src">{r.fuente}</span></>)],
    IPC: ["IPC aplicado", (r) => (<>{F.pct(r.H, 3)} <span className="src">{r.fuente}</span></>)],
    UVR: ["UVR proyectada", (r) => (r.uvrP ? F.n(r.uvrP, 2) : "—")],
  };
  const [titulo, celda] = extra[t];
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Inicio</th>
          <th>Pago</th>
          <th>Días</th>
          <th>Estado</th>
          <th>{titulo}</th>
          <th>Cupón %</th>
          <th>CFt %</th>
          <th>Flujo {t === "UVR" ? "UVR" : "$"}</th>
          <th>Días dcto</th>
          <th>t</th>
          <th>VP CF</th>
          <th>t×VP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.i} className={r.estado === "Pagado" ? "paid" : r.estado === "Vigente" ? "curr" : ""}>
            <td>{r.i}</td>
            <td>{toS(r.start)}</td>
            <td>{toS(r.pay)}</td>
            <td>{r.D}</td>
            <td className="t">{r.estado}</td>
            <td>{celda(r)}</td>
            <td>{F.n(r.K, 4)}</td>
            <td>{F.n(r.L, 4)}</td>
            <td>{t === "UVR" ? F.n(r.COP, 0) : F.cop(r.COP)}</td>
            <td>{r.N}</td>
            <td>{F.n(r.t, 4)}</td>
            <td>{F.n(r.vp, 4)}</td>
            <td>{F.n(r.t * r.vp, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
