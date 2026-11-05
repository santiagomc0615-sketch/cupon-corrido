"use client";
/* Panel del modo clase: fórmula, números del título paso a paso y tabla de flujos. */
import { explicar, type ClaveClase } from "@/lib/clase";
import type { Bono, ResultadoValoracion } from "@/lib/engine";

export const ETIQUETAS_CLASE: [ClaveClase, string][] = [
  ["dirty", "Precio sucio"],
  ["accrued", "Cupón corrido"],
  ["clean", "Precio limpio"],
  ["irr", "TIR"],
  ["mac", "Duración Macaulay"],
  ["mod", "Duración modificada"],
  ["dv01", "DV01"],
  ["conv", "Convexidad"],
  ["giro", "Valor de giro"],
];

export function PasoAPaso({
  b,
  o,
  clave,
  onClave,
}: {
  b: Bono;
  o: ResultadoValoracion;
  clave: ClaveClase;
  onClave: (k: ClaveClase | null) => void;
}) {
  const e = explicar(clave, b, o);
  return (
    <div className="panel clase" aria-live="polite">
      <div className="panel-h">
        <h2>
          <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
            Modo clase · paso a paso
          </span>
          {e.titulo}
        </h2>
        <button type="button" className="btn sm ghost" onClick={() => onClave(null)} aria-label="Cerrar explicación">
          Cerrar
        </button>
      </div>
      <div className="clase-chips" role="tablist" aria-label="Qué explicar">
        {ETIQUETAS_CLASE.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={k === clave} className="chip" onClick={() => onClave(k)}>
            {t}
          </button>
        ))}
      </div>
      <pre className="formula">{e.formula}</pre>
      {e.nota && <p className="src" style={{ marginBottom: 10 }}>{e.nota}</p>}
      <ol className="pasos">
        {e.pasos.map((p, i) => (
          <li key={i}>
            <span className="lbl">{p.etiqueta}</span>
            {p.expresion && <code>{p.expresion}</code>}
            <b className="num">= {p.valor}</b>
          </li>
        ))}
      </ol>
      {e.tabla && (
        <details style={{ marginTop: 12 }} open={e.tabla.filas.length <= 8}>
          <summary>Tabla de flujos ({e.tabla.filas.length})</summary>
          <div className="tbl" style={{ marginTop: 10, maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  {e.tabla.encabezados.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.tabla.filas.map((f, i) => (
                  <tr key={i}>
                    {f.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
                {e.tabla.total && (
                  <tr className="zero">
                    {e.tabla.total.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
