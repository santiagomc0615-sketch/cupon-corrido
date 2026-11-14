"use client";
/* Cifra que cuenta hasta su valor al cargar (héroe de inicio).
   - Sin JavaScript se ve el valor final (lo trae el HTML del servidor).
   - Con JavaScript, el CSS la oculta un instante (.js .cifra-viva:not(.lista)) y aquí arranca en 0 y
     cuenta 700 ms con ease-out; si algo falla, el CSS la muestra igual a los 1,5 s.
   - Con prefers-reduced-motion aparece directo, sin contar. */
import { useEffect, useRef, useState } from "react";

const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function CifraViva({ valor, formato, retardo = 0 }: { valor: number; formato: (v: number) => string; retardo?: number }) {
  const [v, setV] = useState(valor);
  const [lista, setLista] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t0 = 0;
    const paso = (t: number) => {
      if (!t0) t0 = t + retardo;
      const k = easeOut(Math.max(0, t - t0) / 700);
      setV(valor * k);
      if (k < 1) raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame((t) => {
      setLista(true);
      if (reducido) setV(valor);
      else {
        setV(0);
        paso(t);
      }
    });
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [valor, retardo]);

  return (
    <span className={"cifra-viva" + (lista ? " lista" : "")}>
      <span className="sr-only">{formato(valor)}</span>
      <span aria-hidden="true">{formato(v)}</span>
    </span>
  );
}
