"use client";
/* P&G del portafolio a la vista (pestaña «Venta y P&G»): vender todo en una fecha a las mismas
   tasas de compra. Mismos cálculos que la ventana «Ver P&G» (lib/pyg). */
import { useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Panel } from "@/components/ui";
import { edate, toN, toS } from "@/lib/engine";
import { F } from "@/lib/format";
import { entradasPortafolio } from "@/lib/pyg/portafolio";
import { BotonPyGPortafolio } from "./Botones";
import { AvisoTributario } from "./Impuestos";
import { TablaPyG } from "./VentanaPyG";

export function PyGPortafolio() {
  const { motor, datosMotor, pfValorado, pfDate } = useApp();
  const [fecha, setFecha] = useState(() => toS(edate(toN(pfDate), 12)));
  if (!pfValorado.length) return null;
  const e = entradasPortafolio(motor, pfValorado.map((x) => ({ b: x.b, o: x.o })), fecha, { ipc: datosMotor.ipc, exp: datosMotor.exp });
  return (
    <Panel titulo="Estado de resultados (P&G) del portafolio" src={`Valoración ${F.date(pfDate)} · venta a las mismas tasas de compra`}>
      <div className="pyg-inline" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
        <div className="pyg-inline-cab">
          <div className="f" style={{ width: "min(100%, 220px)" }}>
            <label htmlFor="pyg-pf-tab-fecha">Fecha de venta</label>
            <input id="pyg-pf-tab-fecha" type="date" value={fecha} min={pfDate} onChange={(x) => x.target.value && setFecha(x.target.value)} />
          </div>
          <BotonPyGPortafolio className="btn" />
        </div>
        <AvisoTributario />
        {"error" in e ? (
          <p className="alert" role="alert">
            {e.error}
          </p>
        ) : (
          <TablaPyG entradas={e} comisiones={0} id="pf-pyg" />
        )}
      </div>
    </Panel>
  );
}
