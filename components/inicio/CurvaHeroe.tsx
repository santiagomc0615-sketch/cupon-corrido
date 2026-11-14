"use client";
/* Curva TES del héroe: puntos reales (plazo, TIR) unidos con una curva suave que se dibuja al cargar
   (CSS: stroke-dashoffset). Interactiva: al pasar el cursor (o el dedo) muestra el título más
   cercano con su plazo y su TIR. Sin animación ni JavaScript, la curva se ve completa. */
import { useState } from "react";
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
  const [foco, setFoco] = useState<number | null>(null);
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
  const d = trazo(xy);
  // Área bajo la curva: misma línea cerrada contra el eje.
  const area = xy.length ? `${d} L${ult[0].toFixed(1)} ${H - P.b} L${xy[0][0].toFixed(1)} ${H - P.b} Z` : "";

  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let k = 0;
    xy.forEach((p, i) => {
      if (Math.abs(p[0] - px) < Math.abs(xy[k][0] - px)) k = i;
    });
    setFoco(k);
  };
  const f = foco != null ? tes[foco] : null;
  const fxy = foco != null ? xy[foco] : null;

  return (
    <figure className="curva-heroe">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Curva TES tasa fija del ${F.date(fecha)}: de ${F.pct(ys[0], 2)} a ${F.pct(ys[ys.length - 1], 2)}`}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
      >
        <defs>
          <linearGradient id="ch-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--engrave)", stopOpacity: 0.22 }} />
            <stop offset="1" style={{ stopColor: "var(--engrave)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
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
        <path className="ch-area" d={area} fill="url(#ch-area)" />
        <path className="ch-linea" d={d} pathLength={1} />
        {xy.map(([a, b], i) => (
          <circle key={i} className={"ch-punto" + (i === foco ? " activo" : "")} cx={a} cy={b} r={i === foco ? 6 : 3} style={{ "--i": i } as React.CSSProperties} />
        ))}
        {ult && foco == null && <circle className="ch-fin" cx={ult[0]} cy={ult[1]} r={5} />}
        {fxy && <line className="ch-guia" x1={fxy[0]} x2={fxy[0]} y1={P.t} y2={H - P.b} />}
        {/* Área de captura del puntero (toda la gráfica) */}
        <rect x={P.l} y={0} width={W - P.l - P.r} height={H} fill="transparent" />
      </svg>
      {f && fxy && (
        <div className="ch-ficha" style={{ left: `${(fxy[0] / W) * 100}%`, top: `${(fxy[1] / H) * 100}%` }} role="status">
          <b>{f[0].replace("TES TF ", "TES ")}</b>
          <span>
            {nf(1).format(f[4])} años · TIR {F.pct(f[3], 2)}
          </span>
        </div>
      )}
      <figcaption className="src">Curva TES tasa fija · TIR E.A. por plazo · {F.date(fecha)} · pase el cursor por la curva</figcaption>
    </figure>
  );
}
