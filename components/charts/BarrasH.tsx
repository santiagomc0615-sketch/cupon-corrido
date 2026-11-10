/* Barras horizontales para valores con signo por categoría (escenarios, pruebas de estrés):
   nombre a la izquierda, barra desde una línea de cero y la cifra alineada a la derecha.
   Se lee como una tabla: cada fila dice qué es, hacia dónde va y cuánto. HTML puro, sin SVG,
   así el texto queda nítido y se ajusta al ancho. */
import type { ReactNode } from "react";

export interface FilaBarra {
  /** Nombre de la fila (título, escenario…). */
  etiqueta: ReactNode;
  /** Etiqueta corta junto al nombre (p. ej. el tipo de título). */
  tag?: string;
  valor: number;
  /** Cifra que se muestra (ya formateada). */
  texto: string;
  /** Segunda línea pequeña bajo la cifra (p. ej. % del valor). */
  sub?: string;
  /** Texto completo para lectores de pantalla y para el título al pasar el cursor. */
  descripcion?: string;
}

/** Signo menos tipográfico (−) en lugar del guion que deja Intl, igual que en las cifras en pesos. */
const menos = (s?: string) => s?.replace(/(^|\s)-(?=\d)/g, "$1−");

export function BarrasH({ filas, label }: { filas: FilaBarra[]; label: string }) {
  const lo = Math.min(0, ...filas.map((f) => f.valor)),
    hi = Math.max(0, ...filas.map((f) => f.valor));
  const span = hi - lo || 1;
  const cero = (-lo / span) * 100;
  return (
    <div className="barras-h" role="list" aria-label={label}>
      {filas.map((f, i) => {
        const ancho = (Math.abs(f.valor) / span) * 100;
        const izq = f.valor < 0 ? cero - ancho : cero;
        const signo = f.valor > 0 ? "pos" : f.valor < 0 ? "neg" : "cero";
        return (
          <div className="bh-fila" role="listitem" key={i} title={f.descripcion} aria-label={f.descripcion}>
            <span className="bh-nombre">
              {f.tag && <span className="tag">{f.tag}</span>}
              <span className="bh-txt">{f.etiqueta}</span>
            </span>
            <span className="bh-pista" aria-hidden="true">
              <span className="bh-cero" style={{ left: `${cero}%` }} />
              <span className={"bh-barra " + signo} style={{ left: `${izq}%`, width: `max(${ancho}%, 2px)` }} />
            </span>
            <span className={"bh-valor " + signo} aria-hidden="true">
              {menos(f.texto)}
              {f.sub && <small>{menos(f.sub)}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
