"use client";
/* Comparador CDT vs. TES TF, bono IBR, bono IPC y TES UVR al mismo monto y plazo, mantenidos al
   vencimiento: ganancia bruta, después de impuestos y real; riesgo, liquidez y escenarios.
   Cálculos en lib/pyg/comparador.ts (motor de la calculadora). */
import { useDeferredValue, useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Panel } from "@/components/ui";
import { F, nf } from "@/lib/format";
import { NOMBRE_CONTRIBUYENTE } from "@/lib/impuestos/perfil";
import { compararOpciones, escenariosComparador, NOMBRE_OPCION, RIESGO, type Opcion } from "@/lib/pyg/comparador";
import { useGuardado } from "@/lib/storage";
import { AvisoTributario, PanelImpuestos, useImpuestos } from "./Impuestos";

const mill = (v: number) => F.mill(v, 1);

export function Comparador() {
  const { datosMotor, snap } = useApp();
  const { params, perfil } = useImpuestos();
  const [monto, setMonto] = useGuardado<number>("cmpMonto", 100_000_000);
  const [plazo, setPlazo] = useGuardado<number>("cmpPlazo", 3);
  const [tasaPropia, setTasaPropia] = useGuardado<number | null>("tasaCDT", null);
  const [verPerfil, setVerPerfil] = useState(false);
  const tasaCDT = tasaPropia ?? snap.dtf?.valor ?? 0.1;
  const entrada = useDeferredValue({ monto, plazoAnios: plazo, fecha: snap.fechaAnalisis, tasaCDT });

  const filas = useMemo(() => compararOpciones(datosMotor, entrada, perfil, params), [datosMotor, entrada, perfil, params]);
  const esc = useMemo(() => escenariosComparador(datosMotor, entrada, perfil, params), [datosMotor, entrada, perfil, params]);
  const opciones = filas.map((f) => f.opcion);
  const mejorReal = filas.reduce<Opcion | null>((m, f) => (f.pyg && (!m || f.pyg.real > (filas.find((x) => x.opcion === m)?.pyg?.real ?? -Infinity)) ? f.opcion : m), null);

  return (
    <Panel titulo="Comparador: CDT vs. TES y bonos" src={`Curva TES ${F.date(snap.datos.curveDate)} · motor de la calculadora · al vencimiento`}>
      <div className="comparador">
        <AvisoTributario />
        <div className="cmp-controles">
          <div className="f">
            <label htmlFor="cmp-monto">Monto</label>
            <div className="u">
              <input id="cmp-monto" type="number" min={1000000} step={1000000} inputMode="numeric" value={monto} onChange={(e) => +e.target.value > 0 && setMonto(+e.target.value)} style={{ paddingRight: 26 }} />
              <span>$</span>
            </div>
          </div>
          <div className="f">
            <label htmlFor="cmp-plazo">Plazo</label>
            <div className="u">
              <input id="cmp-plazo" type="number" min={0.5} max={20} step={0.5} inputMode="decimal" value={plazo} onChange={(e) => +e.target.value >= 0.5 && setPlazo(Math.min(20, +e.target.value))} style={{ paddingRight: 44 }} />
              <span>años</span>
            </div>
          </div>
          <div className="f">
            <label htmlFor="cmp-cdt">Tasa del CDT (E.A.)</label>
            <div className="u">
              <input
                id="cmp-cdt"
                type="number"
                step={0.01}
                inputMode="decimal"
                value={+(tasaCDT * 100).toFixed(4)}
                onChange={(e) => setTasaPropia(e.target.value === "" ? null : +e.target.value / 100)}
                style={{ paddingRight: 26 }}
              />
              <span>%</span>
            </div>
            <span className="src">{tasaPropia == null && snap.dtf ? `DTF · BanRep · ${F.date(snap.dtf.fecha)}` : "Tasa propia"}</span>
          </div>
          <div className="f">
            <span className="etq-f">Perfil</span>
            <button type="button" className="btn" aria-expanded={verPerfil} onClick={() => setVerPerfil(!verPerfil)}>
              {NOMBRE_CONTRIBUYENTE[perfil.tipo].replace(" a llevar contabilidad", "")}
            </button>
          </div>
        </div>
        {verPerfil && <PanelImpuestos />}

        <div className="tbl" style={{ maxHeight: "none" }}>
          <table className="cmp-tabla">
            <caption className="sr-only">Ganancia de cada alternativa mantenida al vencimiento</caption>
            <thead>
              <tr>
                <th scope="col">Alternativa</th>
                <th scope="col">Tasa</th>
                <th scope="col">Ganancia bruta</th>
                <th scope="col">Después de impuestos</th>
                <th scope="col">Real (descontada la inflación)</th>
                <th scope="col">Duración</th>
                <th scope="col">Riesgo de precio</th>
                <th scope="col">Liquidez</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.opcion} className={f.opcion === mejorReal ? "cmp-mejor" : undefined}>
                  <th scope="row">
                    {NOMBRE_OPCION[f.opcion]}
                    {f.opcion === mejorReal && <span className="chip pos">mayor ganancia real</span>}
                  </th>
                  <td className="t">{f.tasa}</td>
                  {f.pyg ? (
                    <>
                      <td>
                        {mill(f.pyg.utilidadAntes)}
                        <span className="src">{F.pct(f.pyg.rentNominal, 2)} E.A.</span>
                      </td>
                      <td>
                        {mill(f.pyg.neta)}
                        <span className="src">{F.pct(f.pyg.rentDespues, 2)} E.A.</span>
                      </td>
                      <td>
                        {mill(f.pyg.real)}
                        <span className="src">{F.pct(f.pyg.rentReal, 2)} E.A.</span>
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="t">
                      {f.error}
                    </td>
                  )}
                  <td>{f.duracion == null ? "—" : F.n(f.duracion, 2)}</td>
                  <td className="t cmp-texto">{RIESGO[f.opcion].precio}</td>
                  <td className="t cmp-texto">{RIESGO[f.opcion].liquidez}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="h-sub">Escenarios: ¿cuál gana?</h3>
        <div className="tbl" style={{ maxHeight: "none" }}>
          <table className="cmp-tabla">
            <caption className="sr-only">Ganancia real neta de cada alternativa en cada escenario</caption>
            <thead>
              <tr>
                <th scope="col">Escenario</th>
                {opciones.map((o) => (
                  <th key={o} scope="col">
                    {NOMBRE_OPCION[o]}
                  </th>
                ))}
                <th scope="col">Gana</th>
              </tr>
            </thead>
            <tbody>
              {esc.map((x) => (
                <tr key={x.escenario.id}>
                  <th scope="row">{x.escenario.nombre}</th>
                  {opciones.map((o) => (
                    <td key={o} className={o === x.ganador ? "cmp-gana" : undefined}>
                      {x.reales[o] == null ? "—" : mill(x.reales[o] as number)}
                    </td>
                  ))}
                  <td className="t">
                    <b>{x.ganador ? NOMBRE_OPCION[x.ganador] : "—"}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="src">
          Ganancia real neta al vencimiento, después de impuestos ({NOMBRE_CONTRIBUYENTE[perfil.tipo].toLowerCase()}) e inflación. Supuestos: TES TF a la
          TIR de la curva a {nf(1).format(plazo)} años; IBR, IPC y UVR con los spreads del ejemplo de la calculadora; los títulos se mantienen al
          vencimiento, así que el movimiento de tasas solo cambia los cupones del IBR (en tasa fija cambiaría el precio si se vendiera antes). En los
          escenarios de inflación se ajustan los flujos IPC/UVR y la inflación del periodo; la inflación base es la proyectada con la encuesta del
          BanRep. Los cupones no se reinvierten.
        </p>
      </div>
    </Panel>
  );
}
