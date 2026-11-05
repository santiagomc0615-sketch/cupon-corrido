"use client";
/* Borra todo lo que la página guardó en este navegador (prefijo cc_). */
import { useState } from "react";

export function BorrarDatos() {
  const [hecho, setHecho] = useState<number | null>(null);
  const borrar = () => {
    if (!confirm("¿Borrar el portafolio, la calculadora y las preferencias guardadas en este navegador?")) return;
    let n = 0;
    for (const almacen of [localStorage, sessionStorage]) {
      for (const k of Object.keys(almacen)) {
        if (k.startsWith("cc_")) {
          almacen.removeItem(k);
          n++;
        }
      }
    }
    document.documentElement.removeAttribute("data-theme");
    setHecho(n);
  };
  return (
    <div className="notice" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn" onClick={borrar}>
        Borrar mis datos de este navegador
      </button>
      <span>
        {hecho == null
          ? "Elimina el portafolio, las entradas de la calculadora y las preferencias guardadas localmente."
          : hecho
            ? `Listo: se borraron ${hecho} elementos. Recargue la página para empezar de cero.`
            : "No había datos guardados de esta página."}
      </span>
    </div>
  );
}
