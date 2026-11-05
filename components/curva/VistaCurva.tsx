"use client";
import Link from "next/link";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { Breakeven } from "./Breakeven";
import { Encabezado, Kpi, Panel } from "@/components/ui";
import { F, pctAx } from "@/lib/format";

export function VistaCurva() {
  const { snap, mk, motor } = useApp();
  const z = motor.spot;
  const tpm = snap.macro.tpm;
  const { zs, mk: pts, fw } = mk.curva;
  const slope = (mk.tes10[3] - mk.tes2[3]) * 1e4;
  const shape = slope > 25 ? "Positiva (normal)" : slope < -25 ? "Invertida" : "Plana";
  const ultimo = zs[zs.length - 1];
  const pol: PuntoSerie[] = [
    [0, tpm],
    [ultimo[0], tpm],
  ];

  return (
    <section className="view">
      <Encabezado eyebrow="Estructura temporal de tasas">
        Curva <em>TES</em> tasa fija
      </Encabezado>
      <div className="kpis">
        <Kpi l="Fecha de la curva" v={F.date(motor.mercado.curveDate)} vStyle={{ fontSize: 20 }} s="TIR de cierre cargada" />
        <Kpi l="Forma" v={shape} vStyle={{ fontSize: 20 }} s={"pendiente " + F.bp(slope)} />
        <Kpi l="Spot 1 año" v={F.pct(z(1), 2)} s="cero cupón E.A." />
        <Kpi l="Spot 10 años" v={F.pct(z(10), 2)} s="cero cupón E.A." />
        <Kpi l="Prima vs. TPM" v={F.bp((z(10) - tpm) * 1e4)} s="spot 10a − tasa política" />
      </div>

      <Panel titulo="Curva cero cupón, forwards y TIR de mercado" src="Bootstrapping de bonos par anuales (hoja Curva_Rendimiento)">
        <Chart
          series={[
            { data: zs, cls: "s-a", area: true },
            { data: fw, cls: "s-c" },
            { data: pol, cls: "s-d" },
            { data: pts, pointsOnly: true, points: "pt-b", r: 4.5 },
          ]}
          xmin={0}
          yf={pctAx(1)}
          xf={(v) => v + "a"}
          label="Curva TES"
          h={320}
          tip={(x) => {
            const t = Math.max(0.25, x);
            const zz = z(t);
            const f = nearest(fw, x);
            return {
              x: t,
              y: zz,
              content: (
                <>
                  {F.n(t, 2)} años
                  <br />
                  Spot {F.pct(zz, 3)} · Fwd {F.pct(f[1], 3)}
                </>
              ),
            };
          }}
        />
        <div className="legend">
          <span>
            <i />
            Spot cero cupón
          </span>
          <span>
            <i className="c" />
            Forward 1 año implícito
          </span>
          <span>
            <i className="b" style={{ height: 8, width: 8, borderRadius: "50%" }} />
            TES de mercado
          </span>
          <span>
            <i className="d" />
            Tasa de política
          </span>
        </div>
      </Panel>

      <Breakeven />

      <div className="grid-c g2">
        <Panel titulo="Referencias TES" src={"Cierre " + F.date(motor.mercado.curveDate)}>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Vence</th>
                  <th>Cupón</th>
                  <th>TIR</th>
                  <th>Plazo</th>
                  <th>vs. spot</th>
                </tr>
              </thead>
              <tbody>
                {mk.tesSorted.map((r) => (
                  <tr key={r[0]}>
                    <td className="t">{r[0]}</td>
                    <td>{r[1]}</td>
                    <td>{F.pct(r[2], 2)}</td>
                    <td>{F.pct(r[3], 3)}</td>
                    <td>{F.n(r[4], 2)}</td>
                    <td>{F.bp((r[3] - z(r[4])) * 1e4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel titulo="Lectura de la curva">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "var(--ink-2)" }}>
            <p>
              La curva arranca en {F.pct(z(0.25), 2)} y llega a {F.pct(ultimo[1], 2)} en {ultimo[0]} años. Con la tasa
              de política en {F.pct(tpm, 2)}, el tramo corto de TES rinde {F.bp((z(1) - tpm) * 1e4)} frente a la TPM:
              el mercado descuenta recortes futuros.
            </p>
            <p>
              Los forwards implícitos muestran qué tasa a 1 año espera el mercado en cada punto. Si crees que las tasas
              bajarán más rápido que los forwards, alargar duración en tasa fija gana; si no, el carry de IBR e IPC
              compensa con menos riesgo.
            </p>
            <p>
              Pide al <Link href="/asesor">asesor IA</Link> que contraste tu portafolio con esta curva.
            </p>
          </div>
        </Panel>
      </div>
    </section>
  );
}
