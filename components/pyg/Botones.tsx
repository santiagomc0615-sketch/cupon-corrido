"use client";
/* Botones «Ver P&G» ya armados: un título al vencimiento y el portafolio vendido en una fecha. */
import { useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { edate, toN, toS, type Bono, type ResultadoValoracion } from "@/lib/engine";
import { F } from "@/lib/format";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { entradasPortafolio } from "@/lib/pyg/portafolio";
import { useFondeoPyG } from "./useFondeoPyG";
import { BotonPyG } from "./VentanaPyG";

export function BotonPyGTitulo({ b, o, titulo }: { b: Bono; o: ResultadoValoracion; titulo: string }) {
  const { motor, datosMotor } = useApp();
  const fondeo = useFondeoPyG(o.giro);
  return (
    <BotonPyG
      fondeo={fondeo}
      etiqueta="Ver P&G al vencimiento"
      titulo={titulo}
      subtitulo={`Compra el ${F.date(b.valoracion)} y se mantiene hasta el vencimiento (${F.date(b.vencimiento)})`}
      construir={() =>
        entradasDesdeMotor(
          motor,
          b,
          o,
          { alVencimiento: true },
          { ipc: datosMotor.ipc, exp: datosMotor.exp },
        )
      }
    />
  );
}

export function BotonPyGPortafolio({ className }: { className?: string }) {
  const { motor, datosMotor, pfValorado, pfDate } = useApp();
  const [fecha, setFecha] = useState(() => toS(edate(toN(pfDate), 12)));
  const fondeo = useFondeoPyG(pfValorado.reduce((s, x) => s + x.o.giro, 0));
  if (!pfValorado.length) return null;
  return (
    <BotonPyG
      fondeo={fondeo}
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
