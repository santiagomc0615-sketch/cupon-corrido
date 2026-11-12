"use client";
/* Carry y fondeo del portafolio: el mismo fondeo de la calculadora aplicado a todas las posiciones.
   Carry total, % fondeado y costo de fondeo total. */
import { useMemo } from "react";
import { ComparacionExterior } from "@/components/fondeo/ComparacionExterior";
import { ControlesExterior, ControlesFondeo, useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { TablaHorizontes } from "@/components/fondeo/TablaHorizontes";
import { useApp } from "@/components/providers/AppProvider";
import { Kpi, Panel } from "@/components/ui";
import { carryPortafolioFondeo } from "@/lib/carry/config";
import { NOMBRE_FONDEO } from "@/lib/carry/fondeo";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { F, nf } from "@/lib/format";

export function FondeoPortafolio() {
  const { pfValorado } = useApp();
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  const posiciones = useMemo(() => pfValorado.map((x) => posicionDesdeMotor(x.b, x.o)), [pfValorado]);
  const t = carryPortafolioFondeo(posiciones, c, m);
  if (!posiciones.length) return null;
  const anual = t?.horizontes.find((h) => h.dias === 365);

  return (
    <Panel titulo="Carry y fondeo del portafolio" src={`${posiciones.length} posiciones · mismo fondeo que en la calculadora`}>
      <ControlesFondeo id="pf" />
      {t ? (
        <>
          <div className="kpis k4 fondeo-kpis" style={{ marginTop: 16 }}>
            <Kpi
              l="Carry neto diario"
              v={F.mill(t.carryDia)}
              vStyle={{ color: `var(--${t.carryDia >= 0 ? "pos" : "neg"})` }}
              s={anual ? `${F.copM(anual.carry)} a 365 días` : undefined}
            />
            <Kpi l="Costo de fondeo total (día)" v={F.mill(t.costoDia)} s={anual ? `${F.copM(anual.costo)} a 365 días · ${F.pct(t.tasaEA, 3)} E.A.` : undefined} />
            <Kpi l="% fondeado" v={F.pct(t.pctFondeado, 1)} s={`${F.copM(t.fondeado)} de ${F.copM(t.giro)} · ${NOMBRE_FONDEO[c.tipo]}`} />
            <Kpi
              l="ROE y colchón (365 días)"
              v={anual ? F.pct(anual.roe, 2) : "—"}
              s={anual ? `Colchón ${nf(1).format(anual.colchonPb)} pb sobre el DV01 total` : undefined}
            />
          </div>
          <TablaHorizontes h={t.horizontes} />
        </>
      ) : (
        <p className="src" role="status" style={{ marginTop: 12 }}>
          Para fondear en dólares falta la SOFR o la TRM: ingrese la SOFR en «Fondeo en el exterior».
        </p>
      )}
      <details className="fondeo-ext">
        <summary>Fondeo en el exterior (USD): sin cubrir vs. cubierto</summary>
        <ControlesExterior id="pf-ext" />
        <ComparacionExterior montoFondeado={t?.fondeado ?? posiciones.reduce((s, p) => s + p.giro, 0) * (1 - c.haircut)} />
      </details>
    </Panel>
  );
}
