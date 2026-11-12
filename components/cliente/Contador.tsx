"use client";
/* Número que cuenta hasta su valor. Se puede interrumpir: si el valor cambia a mitad de camino, sigue
   desde lo que se ve en pantalla (no salta al inicio). Curva ease-out exponencial, 520 ms.
   Con prefers-reduced-motion muestra el valor final de inmediato.
   El lector de pantalla recibe solo el valor final (aria-label), no los cuadros intermedios. */
import { useEffect, useRef, useState } from "react";

const DURACION = 520;
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function menosMovimiento() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Contador({ valor, formato, className }: { valor: number; formato: (v: number) => string; className?: string }) {
  const [mostrado, setMostrado] = useState(0);
  const actual = useRef(0); // valor que se ve en pantalla en este momento
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    const desde = actual.current;
    if (menosMovimiento() || !Number.isFinite(valor) || desde === valor) {
      actual.current = valor;
      raf.current = requestAnimationFrame(() => setMostrado(valor));
      return () => {
        if (raf.current != null) cancelAnimationFrame(raf.current);
      };
    }
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = easeOut((t - t0) / DURACION);
      actual.current = desde + (valor - desde) * k;
      setMostrado(actual.current);
      if (k < 1) raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame(paso);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [valor]);

  return (
    <span className={className}>
      <span className="sr-only">{formato(valor)}</span>
      <span aria-hidden="true">{formato(mostrado)}</span>
    </span>
  );
}
