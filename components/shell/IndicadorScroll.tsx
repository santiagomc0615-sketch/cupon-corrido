"use client";
/* «Desliza para ver más»: aviso sutil abajo cuando la página tiene contenido debajo y el usuario
   aún no ha bajado. Desaparece al desplazarse y vuelve a evaluarse al cambiar de sección.
   Es decorativo (el contenido se alcanza igual), así que se oculta a los lectores de pantalla. */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function IndicadorScroll() {
  const ruta = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let visto = false;
    const evaluar = () => {
      const resta = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (window.scrollY > 80) visto = true;
      setVisible(!visto && resta > 320);
    };
    const t = setTimeout(evaluar, 900); // después de que la sección cargue
    window.addEventListener("scroll", evaluar, { passive: true });
    window.addEventListener("resize", evaluar);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", evaluar);
      window.removeEventListener("resize", evaluar);
      setVisible(false);
    };
  }, [ruta]);

  return (
    <div className="desliza" data-visible={visible} aria-hidden="true">
      Desliza para ver más
      <svg viewBox="0 0 16 16">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
