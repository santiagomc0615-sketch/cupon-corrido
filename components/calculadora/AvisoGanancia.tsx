"use client";
/* Aviso breve después de valorar: lo que ganaría el cliente y un botón al detalle (el resumen).
   Aparece cuando cambia la valoración (no al abrir la página), se va solo a los 6 s y se puede
   cerrar. Entra desde abajo, el mismo camino por el que sale; con prefers-reduced-motion solo
   cambia la opacidad. Anuncio cortés para lectores de pantalla. */
import { useEffect, useRef, useState } from "react";
import type { ResumenCliente } from "@/lib/cliente";
import { F, nf } from "@/lib/format";

const DURACION = 6000;

export function AvisoGanancia({ r }: { r: ResumenCliente }) {
  const clave = `${Math.round(r.gananciaAnual)}|${Math.round(r.colchonPb)}`;
  const previa = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (previa.current === null) {
      previa.current = clave; // primera valoración: no se avisa
      return;
    }
    if (previa.current === clave) return;
    previa.current = clave;
    // Espera a que el usuario deje de escribir para no parpadear en cada tecla.
    const mostrar = setTimeout(() => setVisible(true), 700);
    const ocultar = setTimeout(() => setVisible(false), 700 + DURACION);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(ocultar);
    };
  }, [clave]);

  const verDetalle = () => {
    setVisible(false);
    const resumen = document.querySelector<HTMLElement>(".resumen");
    resumen?.scrollIntoView({ block: "center" });
    resumen?.querySelector<HTMLElement>("button, .r-cifra")?.focus?.();
  };

  return (
    <div className="aviso-ganancia" data-visible={visible} role="status" aria-live="polite">
      {visible && (
        <>
          <span>
            Con estas condiciones el cliente ganaría <b>{F.mill(r.gananciaAnual, 1)} al año</b> ({"$ " + nf(0).format(Math.round(r.gananciaDiaria))} al día).
          </span>
          <button type="button" className="btn sm primary" onClick={verDetalle}>
            Ver detalle
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setVisible(false)} aria-label="Cerrar el aviso">
            Cerrar
          </button>
        </>
      )}
    </div>
  );
}
