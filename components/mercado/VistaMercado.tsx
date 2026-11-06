"use client";
import Link from "next/link";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { CurvaMini } from "@/components/curva/CurvaMini";
import { ResumenFuentes } from "@/components/datos/EstadoFuentes";
import { useApp } from "@/components/providers/AppProvider";
import { Guilloche, ROSETA } from "@/components/shell/Guilloche";
import { Aviso, Kpi, Panel } from "@/components/ui";
import { toS } from "@/lib/engine";
import { F, MESES, nf, pctAx } from "@/lib/format";

/** Eje x de fechas: "oct '26" */
export const dX = (n: number) => {
  const s = toS(n);
  return MESES[+s.slice(5, 7) - 1] + " '" + s.slice(2, 4);
};

export function VistaMercado() {
  const { snap, mk, motor } = useApp();
  const { macro } = snap;
  const { ipcLast, ipcPrev, ibrLast, tes2, tes10, realRate, uvrHoy } = mk;
  const M = motor.mercado;
  const ibr = ibrLast.d;
  const dIpc = (ipcLast.annual - ipcPrev.annual) * 1e4;

  const ipcS: PuntoSerie[] = mk.ipcV.filter((r) => r.f >= "2022-01-01").map((r) => [r.n, r.annual]);
  const expS: PuntoSerie[] = M.exp.map((r) => [r.n, r.d[1]]);
  const ib = M.ibr.filter((_, i) => i % 3 === 0 || i === M.ibr.length - 1);
  const s1: PuntoSerie[] = ib.map((r) => [r.n, r.d[1] / 100]);
  const s3: PuntoSerie[] = ib.map((r) => [r.n, r.d[3] / 100]);
  const s12: PuntoSerie[] = ib.map((r) => [r.n, r.d[5] / 100]);
  const uv: PuntoSerie[] = M.uvr.filter((_, i) => i % 4 === 0).map((r) => [r.n, r.d[1]]);

  return (
    <section className="view">
      <div className="hero">
        <Guilloche opt={ROSETA} size={1040} className="gl" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 className="eyebrow">Política monetaria · Banco de la República</h1>
          <div className="big num">
            {nf(2).format(macro.tpm * 100)}
            <small>%</small>
          </div>
          <p className="lede">
            Inflación anual {F.pct(ipcLast.annual, 2)} a {F.date(ipcLast.f)} (DANE). Tasa real ex post {F.pct(realRate, 2)}.
            Pendiente TES {tes2[1].slice(0, 4)}–{tes10[1].slice(0, 4)}: {F.bp((tes10[3] - tes2[3]) * 1e4)}.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          <span className="stamp">
            Decisión {F.date(macro.decisionFecha)} · {macro.decision}
          </span>
          <p className="lede" style={{ fontSize: 13 }}>
            Tasa de intervención vigente. La inflación anual sigue por encima del rango meta de 2–4 %, así que la tasa
            real ex post se mantiene alta. Eso favorece el carry de los títulos a tasa fija e IBR frente a duración
            larga.
          </p>
          <span className="src">
            Tasa: {macro.tpmFuente} · {F.date(macro.tpmFecha)} · Decisión: {macro.decisionFuente}
          </span>
        </div>
      </div>

      <div className="kpis k4">
        <Kpi l="Tasa de política" v={F.pct(macro.tpm, 2)} s={macro.tpmFuente + " · " + F.date(macro.tpmFecha)} />
        <Kpi
          l="Inflación 12 meses"
          v={F.pct(ipcLast.annual, 2)}
          s={"DANE · " + ipcLast.f.slice(0, 7)}
          extra={<span className={"chip " + (dIpc > 0 ? "neg" : "pos")}>{(dIpc > 0 ? "▲ " : "▼ ") + F.bp(dIpc)}</span>}
        />
        <Kpi l="Inflación núcleo" v={F.pct(macro.nucleo, 1)} s={"sin alimentos ni regulados · " + macro.nucleoFecha.slice(0, 7)} />
        <Kpi l="Tasa real ex post" v={F.pct(realRate, 2)} s="(1+TPM)/(1+IPC)−1" />
        <Kpi l="IBR overnight" v={nf(3).format(ibr[1]) + " %"} s={`N.A. · ${snap.fuentes.ibr?.fuente ?? "BanRep"} · ${F.date(ibrLast.f)}`} />
        <Kpi l="IBR 3 meses" v={nf(3).format(ibr[3]) + " %"} s={`N.A. · ${snap.fuentes.ibr?.fuente ?? "BanRep"} · ${F.date(ibrLast.f)}`} />
        <Kpi l="UVR hoy" v={nf(4).format(uvrHoy.v)} s={`$/UVR · ${snap.fuentes.uvr?.fuente ?? "BanRep"} · ${F.date(uvrHoy.f)}`} />
        <Kpi l={"TES " + tes10[1].slice(0, 4)} v={F.pct(tes10[3], 3)} s={"TIR E.A. · curva " + F.date(M.curveDate)} />
      </div>

      <div className="grid-c g2">
        <Panel titulo="Inflación anual vs. rango meta" src="DANE · índice base dic-2018">
          <Chart
            series={[
              { data: ipcS, cls: "s-a", area: true, end: "pt-a" },
              { data: expS, cls: "s-b" },
            ]}
            band={[0.02, 0.04]}
            ymin={0}
            yf={pctAx(0)}
            xf={dX}
            label="Inflación anual"
            tip={(x) => {
              const p = nearest([...ipcS, ...expS], x);
              const esExp = expS.includes(p);
              return {
                x: p[0],
                y: p[1],
                content: (
                  <>
                    {toS(p[0]).slice(0, 7)}
                    <br />
                    {esExp ? "Expectativa" : "IPC 12m"} {F.pct(p[1], 2)}
                  </>
                ),
              };
            }}
          />
          <div className="legend">
            <span>
              <i />
              IPC 12 meses
            </span>
            <span>
              <i className="b" />
              Expectativa cargada
            </span>
            <span>
              <i className="e" style={{ height: 8, opacity: 0.3 }} />
              Rango meta 2–4 %
            </span>
          </div>
        </Panel>
        <Panel titulo="IBR por plazo" src={"BanRep · hasta " + F.date(ibrLast.f)}>
          <Chart
            series={[
              { data: s1, cls: "s-a", end: "pt-a" },
              { data: s3, cls: "s-b" },
              { data: s12, cls: "s-c" },
            ]}
            yf={pctAx(1)}
            xf={dX}
            label="IBR"
            tip={(x) => {
              const r = ib.reduce((b, q) => (Math.abs(q.n - x) < Math.abs(b.n - x) ? q : b));
              return {
                x: r.n,
                y: r.d[1] / 100,
                content: (
                  <>
                    {F.date(r.f)}
                    <br />
                    ON {nf(3).format(r.d[1])}% · 3M {nf(3).format(r.d[3])}% · 12M {nf(3).format(r.d[5])}%
                  </>
                ),
              };
            }}
          />
          <div className="legend">
            <span>
              <i />
              Overnight
            </span>
            <span>
              <i className="b" />3 meses
            </span>
            <span>
              <i className="c" />
              12 meses
            </span>
          </div>
        </Panel>
      </div>

      <div className="grid-c g2">
        <Panel
          titulo="Curva TES tasa fija"
          src={
            <Link className="src" href="/curva">
              Ver análisis →
            </Link>
          }
        >
          <CurvaMini />
          <p className="src" style={{ marginTop: 6 }}>
            Curva cero cupón y TIR de cierre · {F.date(M.curveDate)}
          </p>
        </Panel>
        <Panel titulo="UVR diaria" src={"BanRep · hasta " + F.date(mk.ultimaUVR.f)}>
          <Chart
            series={[{ data: uv, cls: "s-a", area: true, end: "pt-a" }]}
            yf={(v) => nf(0).format(v)}
            xf={dX}
            label="UVR"
            pl={44}
            tip={(x) => {
              const p = nearest(uv, x);
              return {
                x: p[0],
                y: p[1],
                content: (
                  <>
                    {toS(p[0])}
                    <br />
                    {nf(4).format(p[1])} $/UVR
                  </>
                ),
              };
            }}
          />
        </Panel>
      </div>

      <Aviso etiqueta="Datos">
        <ResumenFuentes />
      </Aviso>
    </section>
  );
}
