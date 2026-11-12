/* Carry por horizonte: causación, costo, carry, ROE sobre capital propio y colchón en pb. */
import type { CarryHorizonte } from "@/lib/carry/fondeo";
import { F, nf } from "@/lib/format";

export function TablaHorizontes({ h }: { h: CarryHorizonte[] }) {
  return (
    <div className="tbl" style={{ maxHeight: "none", marginTop: 14 }}>
      <table>
        <thead>
          <tr>
            <th>Horizonte</th>
            <th>Causación</th>
            <th>Costo fondeo</th>
            <th>Carry neto</th>
            <th>ROE del periodo</th>
            <th>ROE E.A.</th>
            <th title="Carry del horizonte / DV01: cuántos pb puede subir la tasa antes de perder">Colchón</th>
          </tr>
        </thead>
        <tbody>
          {h.map((x) => (
            <tr key={x.dias}>
              <td className="t">{x.dias} días</td>
              <td>{F.copM(x.causacion)}</td>
              <td>{F.copM(x.costo)}</td>
              <td style={{ color: `var(--${x.carry >= 0 ? "pos" : "neg"})` }}>{F.copM(x.carry)}</td>
              <td>{F.pct(x.roe, 2)}</td>
              <td>{F.pct(x.roeEA, 2)}</td>
              <td>{nf(1).format(x.colchonPb)} pb</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
