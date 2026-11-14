/* Curva TES del héroe: puntos reales (plazo, TIR) unidos con una curva suave que se dibuja al cargar
   (solo CSS: stroke-dashoffset). Sin animación, la curva se ve completa. */
import type { TuplaTES } from "@/lib/engine";
import { F, nf } from "@/lib/format";

const W = 600,
  H = 260,
  P = { l: 40, r: 16, t: 18, b: 30 };

/** Curva suave por Catmull-Rom pasada a Bézier. */
function trazo(p: [number, number][]): string {
  if (p.length < 2) return "";
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)],
      b = p[i],
      c = p[i + 1],
      e = p[Math.min(p.length - 1, i + 2)];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}

export function CurvaHeroe({ tes, fecha }: { tes: TuplaTES[]; fecha: string }) {
  const pts = tes.map((r) => [r[4], r[3]] as [number, number]);
  const x0 = 0,
    x1 = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys) * 100 - 0.5) / 100,
    y1 = Math.ceil(Math.max(...ys) * 100 + 0.5) / 100;
  const X = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const Y = (v: number) => H - P.b - ((v - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  const xy = pts.map(([a, b]) => [X(a), Y(b)] as [number, number]);
  const ult = xy[xy.length - 1];
  const yTicks = [y0, (y0 + y1) / 2, y1];

  return (
    <figure className="curva-heroe">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva TES tasa fija del ${F.date(fecha)}: de ${F.pct(ys[0], 2)} a ${F.pct(ys[ys.length - 1], 2)}`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="ch-rejilla" x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} />
            <text x={P.l - 6} y={Y(v) + 4} textAnchor="end">
              {nf(1).format(v * 100)}%
            </text>
          </g>
        ))}
        {[1, 5, 10].filter((v) => v <= x1).map((v) => (
          <text key={v} x={X(v)} y={H - 8} textAnchor="middle">
            {v} {v === 1 ? "año" : "años"}
          </text>
        ))}
        <path className="ch-linea" d={trazo(xy)} pathLength={1} />
        {xy.map(([a, b], i) => (
          <circle key={i} className="ch-punto" cx={a} cy={b} r={3} style={{ "--i": i } as React.CSSProperties} />
        ))}
        {ult && <circle className="ch-fin" cx={ult[0]} cy={ult[1]} r={5} />}
      </svg>
      <figcaption className="src">Curva TES tasa fija · TIR E.A. por plazo · {F.date(fecha)}</figcaption>
    </figure>
  );
}
