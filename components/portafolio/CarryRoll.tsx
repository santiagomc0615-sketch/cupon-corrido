"use client";
/* Carry y roll-down de cada posición a 3, 6 y 12 meses. */
import { useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Panel } from "@/components/ui";
import { carryPortafolio, HORIZONTES, type Horizonte } from "@/lib/carry";
import { F } from "@/lib/format";
import { useGuardado } from "@/lib/storage";

export function CarryRoll() {
  const { motor, pfValorado } = useApp();
  const [h, setH] = useGuardado<Horizonte>("carryH", 12);
  const r = useMemo(() => carryPortafolio(motor, pfValorado), [motor, pfValorado]);
  const i = HORIZONTES.indexOf(h);
  const color = (x: number) => ({ color: `var(--${x >= 0 ? "pos" : "neg"})` });

  return (
    <Panel
      titulo="Carry y roll-down"
      src={
        <div className="seg" role="group" aria-label="Horizonte">
          {HORIZONTES.map((x) => (
            <button key={x} type="button" aria-pressed={x === h} onClick={() => setH(x)}>
              {x} meses
            </button>
          ))}
        </div>
      }
    >
      <div className="tbl" style={{ maxHeight: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Hasta</th>
              <th>Carry</th>
              <th>Roll-down</th>
              <th>Total periodo</th>
              <th>Anualizado</th>
              <th>Δ valor</th>
            </tr>
          </thead>
          <tbody>
            {r.filas.map(({ x, porH }) => {
              const c = porH[i];
              return (
                <tr key={(x.p as { id: string }).id}>
                  <td className="t">
                    {(x.p as { inputs: { nombre: string } }).inputs.nombre} <span className="tag">{x.b.tipo}</span>
                  </td>
                  {c ? (
                    <>
                      <td>
                        {F.date(c.fecha)}
                        {c.vence && <span className="src"> vence</span>}
                      </td>
                      <td>{F.pct(c.carry, 2)}</td>
                      <td>{c.roll == null ? <span className="src">n. a.</span> : F.pct(c.roll, 2)}</td>
                      <td style={color(c.total)}>{F.pct(c.total, 2)}</td>
                      <td>{F.pct(c.anual, 2)}</td>
                      <td style={color(c.pesos)}>{F.copM(c.pesos)}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="t src">
                      Sin cálculo para este horizonte
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="zero">
              <td className="t">Portafolio</td>
              <td />
              <td />
              <td />
              <td style={color(r.total[i].total)}>{F.pct(r.total[i].total, 2)}</td>
              <td />
              <td style={color(r.total[i].pesos)}>{F.copM(r.total[i].pesos)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="src" style={{ marginTop: 8 }}>
        Carry: cupones cobrados + cambio del precio sucio con la misma tasa de negociación. Roll-down (solo tasa fija): la TIR se
        desliza por la curva TES cero cupón al acortarse el plazo; para IBR, IPC y UVR no hay curva propia cargada. Los UVR se
        miden en pesos con la UVR proyectada. Sin reinversión de cupones.
      </p>
    </Panel>
  );
}
