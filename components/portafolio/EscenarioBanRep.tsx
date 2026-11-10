"use client";
/* Escenario de política monetaria sobre el portafolio: "si el BanRep mueve la tasa X pb". */
import { useDeferredValue, useMemo } from "react";
import { BarrasH } from "@/components/charts/BarrasH";
import { useApp } from "@/components/providers/AppProvider";
import { Kpi, Panel } from "@/components/ui";
import { TYPE_LBL } from "@/lib/calculadora";
import { escenarioPortafolio, SUPUESTOS_INICIALES, type SupuestosEscenario } from "@/lib/escenarios";
import { F, nf } from "@/lib/format";
import { useGuardado } from "@/lib/storage";

const PRESETS = [-100, -50, -25, 25, 50, 100];

export function EscenarioBanRep() {
  const { datosMotor, pfValorado, pfDate, snap, mk } = useApp();
  const [s, setS] = useGuardado<SupuestosEscenario>("escenario", SUPUESTOS_INICIALES);
  const sd = useDeferredValue(s);
  const r = useMemo(() => escenarioPortafolio(datosMotor, pfValorado, pfDate, sd), [datosMotor, pfValorado, pfDate, sd]);
  const fijar = (c: Partial<SupuestosEscenario>) => setS((x) => ({ ...x, ...c }));
  const pct = (k: "corto" | "largo" | "ibr", etiqueta: string) => (
    <div className="f">
      <label htmlFor={"esc-" + k}>{etiqueta}</label>
      <div className="u">
        <input
          id={"esc-" + k}
          type="number"
          min={0}
          max={150}
          step={5}
          value={Math.round(s[k] * 100)}
          onChange={(e) => fijar({ [k]: Math.max(0, Math.min(1.5, (+e.target.value || 0) / 100)) })}
        />
        <span>%</span>
      </div>
    </div>
  );

  const verbo = s.pb < 0 ? "recorta" : s.pb > 0 ? "sube" : "mantiene";
  return (
    <Panel titulo="Escenario de política monetaria" src="Revaloración completa de cada posición">
      <div style={{ display: "grid", gap: 14 }}>
        <div className="f">
          <label htmlFor="esc-pb">
            Si el BanRep {verbo} la tasa {s.pb ? F.bp(Math.abs(s.pb)).replace("+", "") : ""}: de {F.pct(snap.macro.tpm, 2)} a{" "}
            <b>{F.pct(snap.macro.tpm + s.pb / 1e4, 2)}</b>
          </label>
          <input id="esc-pb" type="range" min={-300} max={300} step={25} value={s.pb} onChange={(e) => fijar({ pb: +e.target.value })} />
          <div className="clase-chips" style={{ marginTop: 6, marginBottom: 0 }}>
            {PRESETS.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={s.pb === p} onClick={() => fijar({ pb: p })}>
                {p > 0 ? "+" : ""}
                {p} pb
              </button>
            ))}
          </div>
        </div>
        <details>
          <summary>Supuestos de traspaso</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 10 }}>
            {pct("corto", "Curva TES ≤ 1 año")}
            {pct("largo", "Curva TES ≥ 10 años")}
            {pct("ibr", "IBR")}
          </div>
          <p className="src" style={{ marginTop: 8 }}>
            La curva se mueve el cambio de la TPM × traspaso, interpolado entre 1 y 10 años según la duración de cada título. Tasa
            fija: TIR + Δ; UVR: TIR real + Δ; IPC: spread real + Δ (el IPC no cambia); IBR: el IBR proyectado se mueve con su
            traspaso y el motor recalcula cupones y descuento.
          </p>
        </details>
        <div className="kpis k3">
          <Kpi l="Δ valor del portafolio" v={F.copM(r.delta)} vStyle={{ color: `var(--${r.delta >= 0 ? "pos" : "neg"})` }} s={F.pct(r.deltaPct, 2) + " del valor"} />
          <Kpi l="TPM del escenario" v={F.pct(snap.macro.tpm + s.pb / 1e4, 2)} s={"hoy " + F.pct(snap.macro.tpm, 2)} />
          <Kpi l="IBR overnight del escenario" v={nf(3).format(mk.ibrLast.d[1] + (s.pb * s.ibr) / 100) + " %"} s={"hoy " + nf(3).format(mk.ibrLast.d[1]) + " %"} />
        </div>
        {r.filas.length > 0 && (
          <BarrasH
            label="Cambio de valor por posición en el escenario"
            filas={r.filas.map((f) => {
              const nombre = (f.p as { inputs: { nombre: string } }).inputs.nombre;
              return {
                etiqueta: nombre,
                tag: f.tipo,
                valor: f.delta,
                texto: F.copM(f.delta),
                sub: F.pct(f.deltaPct, 2) + " · " + F.bp(f.deltaPb),
                descripcion: `${nombre} (${f.tipo}): ${F.copM(f.delta)}, ${F.pct(f.deltaPct, 2)} del valor. ${f.supuesto}.`,
              };
            })}
          />
        )}
        <div className="tbl" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Tipo</th>
                <th>Δ tasa</th>
                <th>Valor hoy</th>
                <th>Valor escenario</th>
                <th>Δ $</th>
                <th>Δ %</th>
              </tr>
            </thead>
            <tbody>
              {r.filas.map((f, i) => (
                <tr key={i} title={f.supuesto}>
                  <td className="t">{(f.p as { inputs: { nombre: string } }).inputs.nombre}</td>
                  <td>
                    <span className="tag">{f.tipo}</span>
                  </td>
                  <td>{F.bp(f.deltaPb)}</td>
                  <td>{F.copM(f.valor0)}</td>
                  <td>{F.copM(f.valor1)}</td>
                  <td style={{ color: `var(--${f.delta >= 0 ? "pos" : "neg"})` }}>{F.copM(f.delta)}</td>
                  <td>{F.pct(f.deltaPct, 2)}</td>
                </tr>
              ))}
              <tr className="zero">
                <td className="t">Portafolio</td>
                <td />
                <td />
                <td>{F.copM(r.valor0)}</td>
                <td>{F.copM(r.valor1)}</td>
                <td style={{ color: `var(--${r.delta >= 0 ? "pos" : "neg"})` }}>{F.copM(r.delta)}</td>
                <td>{F.pct(r.deltaPct, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="src">
          {Object.entries(TYPE_LBL)
            .map(([k, v]) => `${k} = ${v}`)
            .join(" · ")}
          . Pase el cursor sobre una fila para ver el supuesto aplicado. Ejercicio académico: los traspasos reales dependen de
          expectativas, prima por plazo y liquidez.
        </p>
      </div>
    </Panel>
  );
}
