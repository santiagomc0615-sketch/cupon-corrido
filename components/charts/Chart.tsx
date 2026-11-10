"use client";
/* Gráfico SVG propio (el chart() del prototipo en React): líneas, áreas, puntos, barras por
   categoría, banda de referencia y tooltip con línea guía. Usa las clases de color de globals.css
   (s-a, s-b, pt-a, bar-pos…), así respeta el tema claro/oscuro. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type PuntoSerie = [number, number, string?];

export interface Serie {
  data: PuntoSerie[];
  /** Clase del trazo: s-a, s-b, s-c, s-d, s-e */
  cls?: string;
  area?: boolean;
  /** Clase del punto final (pt-a…) */
  end?: string;
  /** Clase de los puntos (pt-a…) */
  points?: string;
  pointsOnly?: boolean;
  /** Mostrar la etiqueta (3.er elemento) junto a cada punto. */
  labels?: boolean;
  r?: number;
}

export interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

export interface ChartProps {
  series: Serie[];
  /** Barras por categoría: [etiqueta, valor, clase opcional] */
  bars?: { data: [string, number, string?][] };
  band?: [number, number];
  xmin?: number;
  xmax?: number;
  ymin?: number;
  ymax?: number;
  yf: (v: number) => string;
  xf?: (v: number) => string;
  xticks?: (x0: number, x1: number) => number[];
  label: string;
  h?: number;
  /** Margen izquierdo para las etiquetas del eje y. */
  pl?: number;
  tip?: (x: number) => Tip | null;
}

function nice(a: number, b: number, n: number): number[] {
  const st = Math.pow(10, Math.floor(Math.log10((b - a) / n)));
  const m = ([1, 2, 2.5, 5, 10].find((k) => (b - a) / (st * k) <= n) ?? 10) * st;
  const out: number[] = [];
  for (let v = Math.ceil(a / m) * m; v <= b + 1e-12; v += m) out.push(+v.toFixed(10));
  return out;
}

/** Ancho del elemento medido con ResizeObserver (0 hasta montarse). */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width);
      setW((prev) => (Math.abs(prev - nw) < 2 ? prev : nw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Chart(props: ChartProps) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [tip, setTip] = useState<(Tip & { left: number; top: number; xx: number; yy: number }) | null>(null);
  return (
    <div className="chart" ref={ref}>
      {ancho > 0 && <Lienzo {...props} ancho={ancho} tip={props.tip} estado={tip} setEstado={setTip} />}
    </div>
  );
}

function Lienzo({
  ancho,
  estado,
  setEstado,
  ...o
}: ChartProps & {
  ancho: number;
  estado: (Tip & { left: number; top: number; xx: number; yy: number }) | null;
  setEstado: (t: (Tip & { left: number; top: number; xx: number; yy: number }) | null) => void;
}) {
  const idArea = "area" + useId().replace(/:/g, "");
  const W = Math.max(300, ancho || 600),
    H = o.h || Math.round(Math.min(300, Math.max(210, W * 0.42)));
  const P = { l: o.pl || 48, r: 14, t: 12, b: 28 };
  const all: [number, number][] = o.series.flatMap((s) => s.data.map((d) => [d[0], d[1]] as [number, number]));
  if (o.bars) {
    all.push(...o.bars.data.map((d, i) => [i, d[1]] as [number, number]), ...o.bars.data.map((_, i) => [i, 0] as [number, number]));
  }
  const xs = all.map((d) => d[0]),
    ys = all.map((d) => d[1]);
  if (o.band) ys.push(o.band[0], o.band[1]);
  let x0 = o.xmin ?? Math.min(...xs),
    x1 = o.xmax ?? Math.max(...xs),
    y0 = o.ymin ?? Math.min(...ys),
    y1 = o.ymax ?? Math.max(...ys);
  if (o.bars) {
    x0 = -0.5;
    x1 = o.bars.data.length - 0.5;
  }
  const pad = (y1 - y0) * 0.08 || 1;
  if (o.ymin == null) y0 -= pad;
  if (o.ymax == null) y1 += pad;
  const X = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const Y = (v: number) => H - P.b - ((v - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);

  const yTicks = nice(y0, y1, 5);
  const xTicks = o.bars ? [] : o.xticks ? o.xticks(x0, x1) : nice(x0, x1, Math.max(3, Math.floor(W / 110)));
  const bw = o.bars ? Math.max(3, ((W - P.l - P.r) / o.bars.data.length) * 0.62) : 0;
  const step = o.bars ? Math.ceil(o.bars.data.length / (W / 70)) : 1;

  const mover = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!o.tip) return;
    const r = ev.currentTarget.getBoundingClientRect(),
      px = ((ev.clientX - r.left) * W) / r.width;
    const xv = x0 + ((px - P.l) / (W - P.l - P.r)) * (x1 - x0);
    const h = o.tip(xv);
    if (!h) {
      setEstado(null);
      return;
    }
    const xx = X(h.x);
    setEstado({
      ...h,
      xx,
      yy: Y(h.y),
      left: Math.min(r.width - 70, Math.max(70, (xx * r.width) / W)),
      top: (Y(h.y) * r.height) / H,
    });
  };

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={o.label}
        onPointerMove={mover}
        onPointerLeave={() => setEstado(null)}
      >
        <defs>
          {/* Área con degradado: intensa junto a la línea y transparente hacia el eje. */}
          <linearGradient id={idArea} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--engrave)", stopOpacity: 0.2 }} />
            <stop offset="1" style={{ stopColor: "var(--engrave)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {o.band && (
          <rect className="band" x={P.l} width={W - P.l - P.r} y={Y(o.band[1])} height={Y(o.band[0]) - Y(o.band[1])} />
        )}
        {yTicks.map((v) => (
          <g key={"y" + v}>
            <line className="grid-l" x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} />
            <text x={P.l - 6} y={Y(v) + 3.5} textAnchor="end">
              {o.yf(v)}
            </text>
          </g>
        ))}
        {y0 < 0 && y1 > 0 && <line className="ax" x1={P.l} x2={W - P.r} y1={Y(0)} y2={Y(0)} />}
        <line className="ax" x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} />
        {o.bars?.data.map((d, i) => {
          const v = d[1],
            y = Y(Math.max(0, v)),
            h = Math.abs(Y(v) - Y(0));
          return (
            <g key={"b" + i}>
              <rect className={d[2] || (v >= 0 ? "bar-pos" : "bar-neg")} x={X(i) - bw / 2} y={y} width={bw} height={Math.max(1, h)} rx={1.5} />
              {i % step === 0 && (
                <text x={X(i)} y={H - P.b + 16} textAnchor="middle">
                  {d[0]}
                </text>
              )}
            </g>
          );
        })}
        {xTicks.map((v) => (
          <text key={"x" + v} x={X(v)} y={H - P.b + 16} textAnchor="middle">
            {o.xf ? o.xf(v) : String(v)}
          </text>
        ))}
        {o.series.map((se, k) => {
          if (!se.data.length) return null;
          const d = se.data.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
          const ult = se.data[se.data.length - 1];
          return (
            <g key={"s" + k}>
              {se.area && (
                <path
                  className="area-a"
                  fill={`url(#${idArea})`}
                  d={`${d}L${X(ult[0])} ${Y(Math.max(y0, 0))}L${X(se.data[0][0])} ${Y(Math.max(y0, 0))}Z`}
                />
              )}
              {!se.pointsOnly && <path className={se.cls} d={d} />}
              {se.points &&
                se.data.map((p, i) => (
                  <g key={i}>
                    <circle className={se.points} cx={X(p[0])} cy={Y(p[1])} r={se.r || 3.5} />
                    {p[2] && se.labels && (
                      <text x={X(p[0]) + 6} y={Y(p[1]) - 6} style={{ fill: "var(--ink-2)" }}>
                        {p[2]}
                      </text>
                    )}
                  </g>
                ))}
              {se.end && (
                <>
                  <circle className={se.end + " halo"} cx={X(ult[0])} cy={Y(ult[1])} r={9} />
                  <circle className={se.end + " fin"} cx={X(ult[0])} cy={Y(ult[1])} r={4.5} />
                </>
              )}
            </g>
          );
        })}
        {estado && (
          <>
            <line className="guia" y1={P.t} y2={H - P.b} x1={estado.xx} x2={estado.xx} />
            <circle className="foco" cx={estado.xx} cy={estado.yy} r={4.5} />
          </>
        )}
      </svg>
      {estado && (
        <div className="tip" style={{ left: estado.left, top: estado.top }}>
          {estado.content}
        </div>
      )}
    </>
  );
}

/** Punto de la serie más cercano a x. */
export function nearest<T extends [number, ...unknown[]]>(arr: T[], x: number): T {
  let b = arr[0],
    d = Infinity;
  for (const p of arr) {
    const dd = Math.abs(p[0] - x);
    if (dd < d) {
      d = dd;
      b = p;
    }
  }
  return b;
}
