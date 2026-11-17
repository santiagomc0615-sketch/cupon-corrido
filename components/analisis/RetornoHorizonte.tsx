"use client";
/* Retorno esperado a 30, 90, 180 y 365 días si la curva no se mueve: barras apiladas (causación,
   roll-down, costo de fondeo y total) y la tabla con las cifras en pesos y en % anualizado.
   Cálculos en lib/analisis/retorno-esperado.ts (todas las valoraciones las hace el motor). */
import { useMemo } from "react";
import { useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { useApp } from "@/components/providers/AppProvider";
import { fondeoConfigurado } from "@/components/reporte/BotonReporte";
import { Panel } from "@/components/ui";
import { curvaPara, HORIZONTES_DIAS, retornoEsperado, sumarRetornos, type CurvaRef, type Retorno } from "@/lib/analisis/retorno-esperado";
import type { Bono, ResultadoValoracion } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import { costoFondeo } from "@/lib/pyg/desde-motor";

interface Fila {
  dias: number;
  cupones: number;
  causacion: number;
  roll: number | null;
  costoFondeo: number;
  total: number;
  pct: number;
  anual: number;
  vence?: boolean;
}

const mill = (v: number) => F.mill(v, 1);

/** Curvas TES del día (tasa fija y, si está cargada, UVR). */
function useCurvas() {
  const { datosMotor } = useApp();
  return useMemo(() => {
    const tf: CurvaRef = { fecha: datosMotor.curveDate, refs: datosMotor.tes.map((r) => [r[4], r[3]] as [number, number]) };
    const u = datosMotor.curvaUVR;
    const uvr: CurvaRef | null = u ? { fecha: u.fecha, refs: u.tes.map((r) => [r[4], r[3]] as [number, number]) } : null;
    return { tf, uvr };
  }, [datosMotor]);
}

/** Costo del fondeo configurado (0 si el usuario no fondea). */
function useCostoFondeo() {
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  const fondeado = fondeoConfigurado() && c.tipo !== "propio";
  // clave: cambia cuando cambia la configuración del fondeo o el mercado (para recalcular)
  const clave = fondeado ? JSON.stringify([c, m.tpm, m.sofr, m.spot, m.ibr?.on]) : "propio";
  return { fondeado, clave, costo: (giro: number) => (d: number) => (fondeado ? costoFondeo(giro, c, m, d) : 0) };
}

function BarrasApiladas({ filas }: { filas: Fila[] }) {
  const max = Math.max(...filas.map((f) => f.causacion + Math.max(0, f.roll ?? 0)), ...filas.map((f) => f.total), 1);
  const min = Math.max(...filas.map((f) => f.costoFondeo + Math.max(0, -(f.roll ?? 0))), 0);
  const escala = max + min;
  const alto = (v: number) => `${(Math.abs(v) / escala) * 100}%`;
  const resumen = filas.map((f) => `${f.dias} días: total ${mill(f.total)}`).join("; ");
  return (
    <figure className="apiladas" role="img" aria-label={`Retorno esperado por horizonte. ${resumen}.`}>
      <div className="ap-area" style={{ "--cero": `${(min / escala) * 100}%` } as React.CSSProperties}>
        {filas.map((f, i) => {
          const rollPos = Math.max(0, f.roll ?? 0),
            rollNeg = Math.max(0, -(f.roll ?? 0));
          return (
            <div key={f.dias} className="ap-col" style={{ "--i": i } as React.CSSProperties}>
              <div className="ap-pos">
                <span className="ap-seg ap-caus" style={{ height: alto(f.causacion) }} />
                {rollPos > 0 && <span className="ap-seg ap-roll" style={{ height: alto(rollPos) }} />}
              </div>
              <div className="ap-neg">
                {f.costoFondeo > 0 && <span className="ap-seg ap-costo" style={{ height: alto(f.costoFondeo) }} />}
                {rollNeg > 0 && <span className="ap-seg ap-roll" style={{ height: alto(rollNeg) }} />}
              </div>
              <span className="ap-total" style={{ bottom: `calc(var(--cero) + ${(f.total / escala) * 100}%)` }}>
                <b>{mill(f.total)}</b>
              </span>
              <span className="ap-eje">{f.dias} días</span>
            </div>
          );
        })}
      </div>
      <figcaption className="legend">
        <span>
          <i className="ap-l-caus" />
          Causación (cupones y precio a tasa constante)
        </span>
        <span>
          <i className="ap-l-roll" />
          Roll-down
        </span>
        <span>
          <i className="ap-l-costo" />
          Costo de fondeo
        </span>
        <span>
          <i className="ap-l-total" />
          Total
        </span>
      </figcaption>
    </figure>
  );
}

function Tabla({ filas, sinRoll }: { filas: Fila[]; sinRoll: string | null }) {
  return (
    <div className="tbl" style={{ maxHeight: "none" }}>
      <table>
        <thead>
          <tr>
            <th>Horizonte</th>
            <th>Cupones</th>
            <th>Causación</th>
            <th>Roll-down</th>
            <th>Costo de fondeo</th>
            <th>Total</th>
            <th>% del periodo</th>
            <th>Anualizado (E.A.)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.dias}>
              <td>
                {f.dias} días{f.vence ? <span className="src"> · vence</span> : null}
              </td>
              <td>{mill(f.cupones)}</td>
              <td>{mill(f.causacion)}</td>
              <td>{f.roll == null ? <span className="src">{sinRoll ?? "n. a."}</span> : mill(f.roll)}</td>
              <td>{f.costoFondeo ? "−" + mill(f.costoFondeo).replace("−", "") : mill(0)}</td>
              <td style={{ color: `var(--${f.total >= 0 ? "pos" : "neg"})` }}>{mill(f.total)}</td>
              <td>{F.pct(f.pct, 2)}</td>
              <td>
                <b>{F.pct(f.anual, 2)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NOTA =
  "Si la curva no se mueve. Causación: cupones del periodo + cambio de precio a la misma tasa de hoy. Roll-down: el título rueda a un plazo más corto; tasa en el horizonte = TIR de la curva TES al plazo restante + el spread actual del título. Costo de fondeo: el configurado en «Carry y fondeo» (lib/carry). Todas las valoraciones las hace el motor; sin reinversión de cupones.";

/** Calculadora: el título abierto. */
export function RetornoTitulo({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  const { motor, datosMotor } = useApp();
  const curvas = useCurvas();
  const { fondeado, clave, costo } = useCostoFondeo();
  const curva = curvaPara(b.tipo, curvas.tf, curvas.uvr);
  const filas = useMemo(
    () => HORIZONTES_DIAS.map((d) => retornoEsperado(motor, b, o, d, curva, costo(o.giro))).filter((r): r is Retorno => !("error" in r)),
    // la función de costo se rehace en cada render; la clave refleja su configuración
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motor, b, o, curva, clave],
  );
  const sinRoll = b.tipo === "IBR" || b.tipo === "IPC" ? "no aplica" : b.tipo === "UVR" && !curva ? "sin curva UVR" : null;
  const r365 = filas[filas.length - 1];
  return (
    <Panel titulo="Retorno esperado al horizonte" src={`Curva TES ${F.date(datosMotor.curveDate)} · ${fondeado ? "con el fondeo configurado" : "con capital propio"}`}>
      <div className="retorno">
        {r365 && (
          <p className="retorno-frase">
            Si la curva no se mueve, en {nf(0).format(r365.dias)} días el título rendiría <b>{mill(r365.total)}</b>, un <b>{F.pct(r365.anual, 2)} anual</b>
            {r365.roll != null && r365.roll > 0 ? <> ({mill(r365.roll)} por roll-down)</> : null}.
          </p>
        )}
        <BarrasApiladas filas={filas} />
        <Tabla filas={filas} sinRoll={sinRoll} />
        <p className="src">
          {NOTA}
          {sinRoll === "no aplica" ? " IBR e IPC: el cupón se ajusta al índice y no hay curva de spreads, así que no hay roll-down." : ""}
          {sinRoll === "sin curva UVR" ? " UVR: cargue la curva TES UVR en «Cargar datos» para calcular su roll-down." : ""}
        </p>
      </div>
    </Panel>
  );
}

/** Portafolio: total por horizonte y el detalle por posición en un horizonte. */
function useRetornosPortafolio() {
  const { motor, pfValorado } = useApp();
  const curvas = useCurvas();
  const { fondeado, clave, costo } = useCostoFondeo();
  return useMemo(() => {
    const filas = pfValorado.map((x) => HORIZONTES_DIAS.map((d) => retornoEsperado(motor, x.b, x.o, d, curvaPara(x.b.tipo, curvas.tf, curvas.uvr), costo(x.o.giro))));
    return { filas, total: sumarRetornos(filas), fondeado };
    // la función de costo se rehace en cada render; la clave refleja su configuración
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor, pfValorado, curvas, clave]);
}

export function RetornoPortafolio() {
  const { datosMotor } = useApp();
  const { total, fondeado } = useRetornosPortafolio();
  const r365 = total[total.length - 1];
  return (
    <Panel titulo="Retorno esperado al horizonte" src={`Curva TES ${F.date(datosMotor.curveDate)} · ${fondeado ? "con el fondeo configurado" : "con capital propio"}`}>
      <div className="retorno">
        <p className="retorno-frase">
          Si la curva no se mueve, en 365 días el portafolio rendiría <b>{mill(r365.total)}</b>, un <b>{F.pct(r365.anual, 2)} anual</b>
          {r365.roll > 0 ? <> ({mill(r365.roll)} por roll-down)</> : null}.
        </p>
        <BarrasApiladas filas={total} />
        <Tabla filas={total} sinRoll={null} />
        <p className="src">{NOTA} El roll-down se calcula en los títulos de tasa fija (y UVR si hay curva UVR cargada).</p>
      </div>
    </Panel>
  );
}

export function RetornoPosiciones() {
  const { pfValorado } = useApp();
  const { filas } = useRetornosPortafolio();
  const i = HORIZONTES_DIAS.length - 1;
  return (
    <Panel titulo="Retorno esperado por posición" src="Horizonte de 365 días · si la curva no se mueve">
      <div className="tbl" style={{ maxHeight: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Hasta</th>
              <th>Causación</th>
              <th>Roll-down</th>
              <th>Costo de fondeo</th>
              <th>Total</th>
              <th>Anualizado</th>
            </tr>
          </thead>
          <tbody>
            {pfValorado.map((x, k) => {
              const r = filas[k]?.[i];
              return (
                <tr key={(x.p as { id: string }).id}>
                  <td className="t">
                    {String((x.p as { inputs: { nombre: string } }).inputs.nombre)} <span className="tag">{x.b.tipo}</span>
                  </td>
                  {r && !("error" in r) ? (
                    <>
                      <td>
                        {F.date(r.fecha)}
                        {r.vence && <span className="src"> vence</span>}
                      </td>
                      <td>{mill(r.causacion)}</td>
                      <td>{r.roll == null ? <span className="src">n. a.</span> : mill(r.roll)}</td>
                      <td>{r.costoFondeo ? "−" + mill(r.costoFondeo) : mill(0)}</td>
                      <td style={{ color: `var(--${r.total >= 0 ? "pos" : "neg"})` }}>{mill(r.total)}</td>
                      <td>{F.pct(r.anual, 2)}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="t src">
                      {r && "error" in r ? r.error : "Sin cálculo"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
