"use client";
/* Panel «Carry y fondeo» de la calculadora: causación a TIR de compra, próximo cupón, costo del
   fondeo, carry neto (diario y a 30, 90 y 365 días), ROE y colchón en pb. Lee la valoración del
   motor y calcula con lib/carry/ (funciones puras). */
import { ComparacionExterior } from "@/components/fondeo/ComparacionExterior";
import { ControlesExterior, ControlesFondeo, useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { TablaHorizontes } from "@/components/fondeo/TablaHorizontes";
import { Kpi, Panel } from "@/components/ui";
import { carryConConfig, faltante } from "@/lib/carry/config";
import { NOMBRE_FONDEO } from "@/lib/carry/fondeo";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import type { Bono, ResultadoValoracion } from "@/lib/engine";
import { F, nf } from "@/lib/format";

const color = (v: number) => ({ color: `var(--${v >= 0 ? "pos" : "neg"})` });

export function CarryFondeo({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  const p = posicionDesdeMotor(b, o);
  const r = carryConConfig(p, c, m);
  const pc = p.proximoCupon;
  const uvr = o.tipo === "UVR";

  return (
    <Panel titulo="Carry y fondeo" src={`Causación a TIR de compra ${F.pct(p.tir, 3)} E.A.${uvr ? " (en pesos)" : ""} · tasas E.A., base 365`}>
      <ControlesFondeo id="cf" />

      {r ? (
        <>
          <div className="kpis k4 fondeo-kpis" style={{ marginTop: 16 }}>
            <Kpi l="Causación diaria" v={F.mill(r.causacionDia.cop)} s={F.pct(r.causacionDia.pct, 4) + " del giro por día"} />
            <Kpi
              l="Costo del fondeo diario"
              v={F.mill(r.costoDia.cop)}
              s={c.tipo === "propio" ? "Sin fondeo" : `${F.pct(r.tasaEA, 3)} E.A. sobre ${F.copM(r.fondeado)}`}
            />
            <Kpi l="Carry neto diario" v={F.mill(r.carryDia)} vStyle={color(r.carryDia)} s={NOMBRE_FONDEO[c.tipo]} />
            <Kpi
              l="Capital propio"
              v={F.copM(r.capital)}
              s={c.tipo === "propio" ? "100 % del giro" : `Fondeado ${F.pct(r.pctFondeado, 1)} (haircut ${F.pct(c.haircut, 1)})`}
            />
          </div>
          <TablaHorizontes h={r.horizontes} />
        </>
      ) : (
        <p className="src" role="status" style={{ marginTop: 12 }}>
          {faltante(c, m)}
        </p>
      )}

      {pc && (
        <div className="cupon-prox">
          <h3 className="h-sub">Próximo cupón</h3>
          <dl>
            <div>
              <dt>Fecha</dt>
              <dd>
                {F.date(pc.fecha)} · faltan {nf(0).format(pc.dias)} días
              </dd>
            </div>
            <div>
              <dt>Cupón</dt>
              <dd>
                {F.n(pc.pct, 4)} % · {F.copM(pc.cop)}
                {pc.amortPct > 0 && <span className="src"> + capital {F.n(pc.amortPct, 2)} %</span>}
              </dd>
            </div>
            <div>
              <dt>Causado del periodo</dt>
              <dd>
                {F.n(pc.causadoPct, 4)} % · {F.copM(pc.causadoCop)}{" "}
                <span className="src">
                  ({nf(0).format(pc.diasCorridos)} de {nf(0).format(pc.diasPeriodo)} días)
                </span>
              </dd>
            </div>
            {uvr && (
              <div>
                <dt>UVR usada</dt>
                <dd>{nf(4).format(p.fx)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <details className="fondeo-ext">
        <summary>Fondeo en el exterior (USD): sin cubrir vs. cubierto</summary>
        <ControlesExterior id="cf-ext" />
        <ComparacionExterior montoFondeado={r?.fondeado ?? p.giro * (1 - c.haircut)} />
      </details>
    </Panel>
  );
}
