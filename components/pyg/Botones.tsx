"use client";
/* Botones «Ver P&G» ya armados: un título al vencimiento y el portafolio vendido en una fecha. */
import { useState } from "react";
import { useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { useApp } from "@/components/providers/AppProvider";
import { fondeoConfigurado } from "@/components/reporte/BotonReporte";
import { edate, toN, toS, type Bono, type ResultadoValoracion } from "@/lib/engine";
import { F } from "@/lib/format";
import { costoFondeo, entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { entradasPortafolio } from "@/lib/pyg/portafolio";
import { BotonPyG } from "./VentanaPyG";

export function BotonPyGTitulo({ b, o, titulo }: { b: Bono; o: ResultadoValoracion; titulo: string }) {
  const { motor, datosMotor } = useApp();
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  return (
    <BotonPyG
      etiqueta="Ver P&G al vencimiento"
      titulo={titulo}
      subtitulo={`Compra el ${F.date(b.valoracion)} y se mantiene hasta el vencimiento (${F.date(b.vencimiento)})`}
      construir={() =>
        entradasDesdeMotor(
          motor,
          b,
          o,
          { alVencimiento: true, costoFondeo: fondeoConfigurado() ? costoFondeo(o.giro, c, m, toN(b.vencimiento) - toN(b.valoracion)) : 0 },
          { ipc: datosMotor.ipc, exp: datosMotor.exp },
        )
      }
    />
  );
}

export function BotonPyGPortafolio({ className }: { className?: string }) {
  const { motor, datosMotor, pfValorado, pfDate } = useApp();
  const [fecha, setFecha] = useState(() => toS(edate(toN(pfDate), 12)));
  if (!pfValorado.length) return null;
  return (
    <BotonPyG
      className={className}
      etiqueta="Ver P&G"
      titulo={`Portafolio · ${pfValorado.length} títulos`}
      subtitulo={`Valoración ${F.date(pfDate)} · venta de todo el ${F.date(fecha)} a las mismas tasas de compra (los que vencen antes, al vencimiento)`}
      controles={
        <div className="f">
          <label htmlFor="pyg-pf-fecha">Fecha de venta</label>
          <input id="pyg-pf-fecha" type="date" value={fecha} min={pfDate} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </div>
      }
      construir={() => entradasPortafolio(motor, pfValorado.map((x) => ({ b: x.b, o: x.o })), fecha, { ipc: datosMotor.ipc, exp: datosMotor.exp })}
    />
  );
}
