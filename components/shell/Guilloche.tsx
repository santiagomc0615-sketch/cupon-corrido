"use client";
/* Grabado guilloché (papel de seguridad) dibujado en canvas con el color --engrave del tema.
   Se redibuja al cambiar de tema claro/oscuro. */
import { useEffect, useRef } from "react";

export interface OpcionesGuilloche {
  /** Radio relativo (0–1). */
  R: number;
  /** Amplitud de la onda. */
  a: number;
  /** Lóbulos. */
  n: number;
  /** Modulación. */
  m: number;
  lines: number;
  alpha: number;
  lw?: number;
}

export const SELLO: OpcionesGuilloche = { R: 0.95, a: 0.32, n: 9, m: 2, lines: 14, alpha: 0.7, lw: 0.8 };
export const ROSETA: OpcionesGuilloche = { R: 0.92, a: 0.22, n: 18, m: 3, lines: 46, alpha: 0.38, lw: 1 };

function dibujar(cv: HTMLCanvasElement, opt: OpcionesGuilloche) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const W = cv.width,
    H = cv.height,
    cx = W / 2,
    cy = H / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--engrave").trim();
  ctx.lineWidth = opt.lw || 1;
  const R = (opt.R * W) / 2;
  for (let k = 0; k < opt.lines; k++) {
    ctx.globalAlpha = opt.alpha;
    ctx.beginPath();
    const ph = ((k / opt.lines) * Math.PI * 2) / opt.n;
    for (let i = 0; i <= 1440; i++) {
      const th = (i / 1440) * Math.PI * 2;
      const r = R * (1 - opt.a) + R * opt.a * Math.sin(opt.n * th + ph) * Math.cos(opt.m * th - ph * 2);
      const x = cx + r * Math.cos(th),
        y = cy + r * Math.sin(th);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function Guilloche({
  opt,
  size,
  className,
}: {
  opt: OpcionesGuilloche;
  /** Tamaño interno del canvas en píxeles (el doble del tamaño visible, para pantallas retina). */
  size: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const redibujar = () => dibujar(cv, opt);
    redibujar();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", redibujar);
    const obs = new MutationObserver(redibujar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", redibujar);
      obs.disconnect();
    };
  }, [opt]);
  return <canvas ref={ref} className={className} width={size} height={size} aria-hidden="true" />;
}
