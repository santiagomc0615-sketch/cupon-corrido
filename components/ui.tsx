/* Piezas pequeñas de interfaz reutilizadas en varias secciones. */
import type { ReactNode } from "react";

export function Kpi({ l, v, s, extra, vStyle }: { l: ReactNode; v: ReactNode; s?: ReactNode; extra?: ReactNode; vStyle?: React.CSSProperties }) {
  return (
    <div className="kpi">
      <span className="l">{l}</span>
      <span className="v" style={vStyle}>
        {v}
      </span>
      {s != null && <span className="s">{s}</span>}
      {extra && <span>{extra}</span>}
    </div>
  );
}

/** Tabla clave–valor de dos columnas numéricas (p. ej. Compra / Venta). */
export function KV({ rows, heads }: { rows: [ReactNode, ReactNode, ReactNode?][]; heads?: string[] }) {
  return (
    <div className="kv">
      {heads?.map((h, i) => (
        <div key={"h" + i} className="h">
          {h}
        </div>
      ))}
      {rows.map((r, i) => (
        <Fila key={i} r={r} />
      ))}
    </div>
  );
}

function Fila({ r }: { r: [ReactNode, ReactNode, ReactNode?] }) {
  return (
    <>
      <div className="lbl">{r[0]}</div>
      <div className="n">{r[1]}</div>
      <div className="n">{r[2] ?? ""}</div>
    </>
  );
}

export function Panel({ titulo, src, children, style }: { titulo: ReactNode; src?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="panel" style={style}>
      <div className="panel-h">
        <h2>{titulo}</h2>
        {src != null && (typeof src === "string" ? <span className="src">{src}</span> : src)}
      </div>
      {children}
    </div>
  );
}

export function Aviso({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="notice">
      <span className="chip warn">
        <span className="dot" />
        {etiqueta}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Encabezado({ eyebrow, children, lede }: { eyebrow: string; children: ReactNode; lede?: ReactNode }) {
  return (
    <div>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{children}</h1>
      {lede && (
        <p className="lede" style={{ marginTop: 8 }}>
          {lede}
        </p>
      )}
    </div>
  );
}
