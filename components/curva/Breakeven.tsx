"use client";
/* Inflación implícita (breakeven) entre la curva TES tasa fija y la curva TES UVR. */
import Link from "next/link";
import { useMemo } from "react";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { Kpi, Panel } from "@/components/ui";
import { curvaBreakeven } from "@/lib/breakeven";
import { F, pctAx } from "@/lib/format";

const META = 0.03;

export function Breakeven() {
  const { snap } = useApp();
  const be = useMemo(() => curvaBreakeven(snap.datos), [snap.datos]);

  if (!be) {
    return (
      <Panel titulo="Inflación implícita (breakeven)" src="Requiere la curva TES UVR">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "var(--ink-2)" }}>
          <p>
            La inflación que descuenta el mercado sale de comparar la curva TES tasa fija (nominal) con la curva TES UVR
            (real): <span className="mono">BE(t) = (1 + spot nominal) / (1 + spot real) − 1</span>. El Excel del curso trae
            solo la curva tasa fija, y el BanRep no publica la curva UVR en su servicio de datos, así que hay que cargarla.
          </p>
          <p>
            En <Link href="/datos">Cargar datos</Link> suba un Excel con una hoja como Curva_Rendimiento pero con los TES UVR
            (Título, Emisión, Vencimiento, Cupón, TIR mercado y la «Fecha de la curva»), o un CSV con
            <span className="mono"> título;vencimiento;cupón real;TIR real</span> eligiendo «Referencias TES UVR». La curva real
            se calcula con el mismo bootstrapping de bonos par.
          </p>
        </div>
      </Panel>
    );
  }

  const bes: PuntoSerie[] = be.puntos.map((p) => [p.t, p.breakeven]);
  const fws: PuntoSerie[] = be.puntos.filter((p) => p.forward != null).map((p) => [p.t, p.forward as number]);
  const meta: PuntoSerie[] = [
    [bes[0][0], META],
    [bes[bes.length - 1][0], META],
  ];
  const en = (t: number) => (t <= be.tMax ? be.be(t) : null);
  const tabla = [1, 2, 3, 5, 7, 10, 15, 20].map((t) => be.puntos.find((p) => p.t === t)).filter((p) => p != null);

  return (
    <Panel titulo="Inflación implícita (breakeven)" src={`TES TF ${F.date(be.fechaNominal)} vs. TES UVR ${F.date(be.fechaReal)}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {be.desfaseDias > 5 && (
          <div className="alert">
            Las curvas son de fechas distintas ({be.desfaseDias} días de diferencia): el breakeven mezcla dos momentos del mercado.
          </div>
        )}
        <div className="kpis k4">
          {[2, 5, 10].map((t) => (
            <Kpi key={t} l={`Breakeven ${t} años`} v={en(t) == null ? "—" : F.pct(en(t), 2)} s={en(t) == null ? "fuera de la curva UVR" : `${F.bp(((en(t) as number) - META) * 1e4)} vs. meta 3 %`} />
          ))}
          <Kpi l="Expectativa a 2 años" v={F.pct(snap.macro.exp2y, 2)} s="encuesta BanRep (dato manual)" />
        </div>
        <Chart
          series={[
            { data: bes, cls: "s-a", area: false, end: "pt-a" },
            { data: fws, cls: "s-c" },
            { data: meta, cls: "s-d" },
          ]}
          band={[0.02, 0.04]}
          xmin={0}
          yf={pctAx(1)}
          xf={(v) => v + "a"}
          label="Inflación implícita por plazo"
          tip={(x) => {
            const p = nearest(bes, x);
            const f = fws.length ? nearest(fws, x) : null;
            return {
              x: p[0],
              y: p[1],
              content: (
                <>
                  {F.n(p[0], 1)} años
                  <br />
                  Breakeven {F.pct(p[1], 2)}
                  {f && Math.abs(f[0] - p[0]) < 0.6 ? <> · Fwd 1a {F.pct(f[1], 2)}</> : null}
                </>
              ),
            };
          }}
        />
        <div className="legend">
          <span>
            <i />
            Breakeven (spot)
          </span>
          <span>
            <i className="c" />
            Breakeven forward a 1 año
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
        <div className="tbl" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Plazo</th>
                <th>Spot nominal</th>
                <th>Spot real</th>
                <th>Breakeven</th>
                <th>Forward 1 año</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((p) => (
                <tr key={p.t}>
                  <td>{p.t} años</td>
                  <td>{F.pct(p.nominal, 3)}</td>
                  <td>{F.pct(p.real, 3)}</td>
                  <td>{F.pct(p.breakeven, 3)}</td>
                  <td>{p.forward == null ? "—" : F.pct(p.forward, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="src">
          El breakeven incluye la expectativa de inflación más primas por riesgo inflacionario y por liquidez (los TES UVR son
          menos líquidos), así que no es una medida pura de expectativas. Fuente de la curva real: {snap.fuentes.tesuvr?.fuente}.
        </p>
      </div>
    </Panel>
  );
}
