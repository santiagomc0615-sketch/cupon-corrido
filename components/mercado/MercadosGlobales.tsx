"use client";
/* Mercados globales en la sección Mercado: TRM, Tesoro de EE. UU. a 10 años, SOFR y spread
   TES 10A − UST 10A. Cada cifra con fuente y fecha; son datos del día, no en tiempo real. */
import { useApp } from "@/components/providers/AppProvider";
import { Kpi, Panel } from "@/components/ui";
import { F, nf } from "@/lib/format";
import { spreadTesUst } from "@/lib/global";

export function MercadosGlobales() {
  const { snap, mk } = useApp();
  const { trm, ust10, sofr, ust10Curva } = snap;
  const spread = ust10Curva ? spreadTesUst({ nombre: mk.tes10[0], tir: mk.tes10[3], plazo: mk.tes10[4] }, ust10Curva, snap.datos.curveDate) : null;
  const varTrm = trm?.anterior ? trm.valor / trm.anterior - 1 : null;

  return (
    <Panel
      titulo="Mercados globales"
      src={
        <span className="chip-dia" title="Se actualizan dos veces al día (12:00 y 21:00 de Bogotá); no son cotizaciones en tiempo real">
          Dato del día
        </span>
      }
    >
      <div className="kpis k4">
        <Kpi
          l="TRM (COP por USD)"
          v={trm ? nf(2).format(trm.valor) : "—"}
          s={trm ? `datos.gov.co · ${F.date(trm.fecha)}` : "Sin dato"}
          extra={
            varTrm != null ? (
              <span className={"chip " + (varTrm > 0 ? "neg" : "pos")}>{(varTrm > 0 ? "▲ " : "▼ ") + F.pct(Math.abs(varTrm), 2)} vs. anterior</span>
            ) : undefined
          }
        />
        <Kpi
          l="Tesoro EE. UU. 10 años"
          v={ust10 ? F.pct(ust10.valor, 2) : "—"}
          s={ust10 ? `Tesoro de EE. UU. · ${F.date(ust10.fecha)} · semestral` : "Sin dato"}
        />
        <Kpi l="SOFR" v={sofr ? F.pct(sofr.valor, 2) : "—"} s={sofr ? `Fed de Nueva York · ${F.date(sofr.fecha)} · a un día` : "Sin dato"} />
        <Kpi
          l="Spread TES 10A − UST 10A"
          v={spread ? nf(0).format(spread.pb) + " pb" : "—"}
          s={
            spread
              ? `${spread.tes.nombre} ${F.pct(spread.tes.tir, 2)} − UST ${F.pct(spread.ust.ea, 2)} (E.A.) · curva del ${F.date(spread.fecha)}${
                  spread.desfase ? ` (UST del ${F.date(spread.ust.fecha)})` : ""
                }`
              : "Sin dato del Tesoro para la fecha de la curva"
          }
        />
      </div>
      <p className="src" style={{ marginTop: 8 }}>
        El spread compara las dos tasas el mismo día (el de la curva TES cargada) y en E.A.: el Tesoro publica su rendimiento semestral y
        se convierte con (1 + y/2)² − 1. La SOFR es la tasa sugerida para el fondeo en dólares (Calculadora → Carry y fondeo).
      </p>
    </Panel>
  );
}
