"use client";
/* Tabla comparativa: fondeo local en pesos vs. exterior sin cubrir vs. exterior cubierto. */
import { comparacion, faltante } from "@/lib/carry/config";
import { NOMBRE_ALTERNATIVA } from "@/lib/carry/exterior";
import { F, nf } from "@/lib/format";
import { useFondeo, useMercadoFondeo } from "./ControlesFondeo";

export function ComparacionExterior({ montoFondeado }: { montoFondeado: number }) {
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  const cmp = comparacion(c, m, montoFondeado);
  if (!cmp)
    return (
      <p className="src" role="status">
        {faltante({ ...c, tipo: "exterior" }, m)}
      </p>
    );
  return (
    <>
      <div className="tbl" style={{ maxHeight: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Alternativa</th>
              <th>Costo E.A. en pesos</th>
              <th>Costo diario</th>
              <th>Costo a 365 días</th>
            </tr>
          </thead>
          <tbody>
            {cmp.filas.map((f) => (
              <tr key={f.alternativa} className={f.alternativa === cmp.masBarata ? "mejor" : undefined}>
                <td className="t">
                  {NOMBRE_ALTERNATIVA[f.alternativa]}
                  {f.alternativa === cmp.masBarata && <span className="chip pos" style={{ marginLeft: 8 }}>Más barata</span>}
                </td>
                <td>{F.pct(f.tasaEA, 3)}</td>
                <td>{F.mill(f.costoDia)}</td>
                <td>{F.copM(f.costoAnual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="src" style={{ marginTop: 8 }}>
        Tasa USD (SOFR + spread) {F.pct(cmp.tasaUSD, 3)} E.A. · forward {nf(2).format(cmp.forward)} a {c.exterior.plazoDias} días (
        {cmp.origenForward === "puntos" ? "puntos ingresados" : "paridad cubierta con IBR y SOFR del día"}), devaluación implícita{" "}
        {F.pct(cmp.devForward, 2)} E.A. · sin cubrir con devaluación {F.pct(cmp.devEsperada, 2)}
        {c.exterior.devEsperada == null ? " (la implícita: sin una expectativa propia)" : " (su supuesto)"}.
        <br />
        <b>Devaluación de equilibrio {F.pct(cmp.devEquilibrio, 2)}</b>: si el peso se devalúa más que eso, fondearse en dólares sin cubrir sale más
        caro que en pesos.
        {cmp.masBarata === "sinCubrir" && (
          <>
            {" "}
            Sin cubrir sale más barato solo con el supuesto de {F.pct(cmp.devEsperada, 2)} de devaluación: el riesgo cambiario queda
            abierto.
          </>
        )}
      </p>
    </>
  );
}
