"use client";
/* Tema claro / automático / oscuro. El script de app/layout.tsx aplica el tema guardado
   antes de pintar para evitar el parpadeo. */
import { useGuardado } from "@/lib/storage";

type Tema = "light" | "system" | "dark";
const OPCIONES: [Tema, string][] = [
  ["light", "Claro"],
  ["system", "Auto"],
  ["dark", "Oscuro"],
];

export function SelectorTema() {
  const [tema, setTema] = useGuardado<Tema>("theme", "system");
  const elegir = (t: Tema) => {
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    setTema(t);
  };
  return (
    <div className="theme" role="group" aria-label="Tema">
      {OPCIONES.map(([t, etiqueta]) => (
        <button key={t} type="button" aria-pressed={tema === t} onClick={() => elegir(t)}>
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Script en línea que aplica el tema guardado antes del primer pintado. */
// Marca «js» en <html>: el CSS solo esconde lo que va a animar si este script corrió.
export const SCRIPT_TEMA = `document.documentElement.classList.add('js');try{var t=JSON.parse(localStorage.getItem('cc_theme'));if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
