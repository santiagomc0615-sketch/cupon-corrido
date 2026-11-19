"use client";
/* Subnavegación fija (sticky) por pestañas. Mismo orden y nombres en calculadora, portafolio,
   vista cliente y PDF (ver NOMBRES_PESTANAS). En celular la barra se desliza horizontalmente.
   Teclado: flechas, Inicio y Fin mueven entre pestañas (patrón ARIA de pestañas). La pestaña
   elegida se recuerda por pantalla. Cambiar de pestaña no anima: se usa muchas veces seguidas. */
import Link from "next/link";
import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useGuardado, useHidratado } from "@/lib/storage";

export type IdPestana = "resumen" | "riesgo" | "flujos" | "carry" | "venta" | "analisis" | "objetivo";

/** Nombres únicos para todas las pantallas y el PDF. */
export const NOMBRES_PESTANAS: Record<IdPestana, string> = {
  resumen: "Resumen",
  riesgo: "Riesgo y sensibilidad",
  flujos: "Flujos",
  carry: "Carry y fondeo",
  venta: "Venta y P&G",
  analisis: "Análisis",
  objetivo: "Buscar objetivo",
};

export interface Pestana {
  id: IdPestana;
  contenido: ReactNode;
}

const CtxPestanas = createContext<((id: IdPestana) => void) | null>(null);
/** Cambiar de pestaña desde dentro de una pestaña (tarjetas «Siguiente paso»). */
export const useIrAPestana = () => useContext(CtxPestanas);

export function Pestanas({ pantalla, pestanas }: { pantalla: string; pestanas: Pestana[] }) {
  const [guardada, fijar] = useGuardado<IdPestana>(`pestana-${pantalla}`, pestanas[0].id);
  const hidratado = useHidratado();
  const activa = hidratado && pestanas.some((p) => p.id === guardada) ? guardada : pestanas[0].id;
  const base = useId();
  const marco = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const elegir = (id: IdPestana, foco = false) => {
    fijar(id);
    const boton = lista.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`);
    if (foco) boton?.focus();
    boton?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Si se cambia estando más abajo, la pestaña nueva empieza justo bajo la barra fija.
    const m = marco.current;
    if (m) {
      const fijo = parseFloat(getComputedStyle(m).getPropertyValue("--top-fijo")) || 0;
      const inicio = m.getBoundingClientRect().top + window.scrollY - fijo - 8;
      if (window.scrollY > inicio) window.scrollTo({ top: inicio });
    }
  };

  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = pestanas.findIndex((p) => p.id === activa);
    const n = pestanas.length;
    const destino =
      e.key === "ArrowRight" ? pestanas[(i + 1) % n] : e.key === "ArrowLeft" ? pestanas[(i - 1 + n) % n] : e.key === "Home" ? pestanas[0] : e.key === "End" ? pestanas[n - 1] : null;
    if (destino) {
      e.preventDefault();
      elegir(destino.id, true);
    }
  };

  return (
    <CtxPestanas.Provider value={elegir}>
      <div className="pestanas-marco" ref={marco}>
        <div className="pestanas">
          <div className="pestanas-lista" role="tablist" aria-label="Secciones" ref={lista}>
            {pestanas.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                data-id={p.id}
                id={`${base}-t-${p.id}`}
                aria-selected={activa === p.id}
                aria-controls={`${base}-p-${p.id}`}
                tabIndex={activa === p.id ? 0 : -1}
                onClick={() => elegir(p.id)}
                onKeyDown={teclas}
              >
                {NOMBRES_PESTANAS[p.id]}
              </button>
            ))}
          </div>
        </div>
        {pestanas.map((p) => (
          <div key={p.id} role="tabpanel" id={`${base}-p-${p.id}`} aria-labelledby={`${base}-t-${p.id}`} hidden={activa !== p.id} className="pestana-panel">
            {activa === p.id ? p.contenido : null}
          </div>
        ))}
      </div>
    </CtxPestanas.Provider>
  );
}

const Flecha = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="sp-flecha">
    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Tarjeta al final de cada pestaña que invita al siguiente paso: un enlace, otra pestaña o una acción. */
export function SiguientePaso({ titulo, texto, href, pestana, onClick }: { titulo: string; texto?: string; href?: string; pestana?: IdPestana; onClick?: () => void }) {
  const ir = useIrAPestana();
  const contenido = (
    <>
      <span className="sp-etq">Siguiente paso</span>
      <span className="sp-titulo">
        {titulo}
        <Flecha />
      </span>
      {texto ? <span className="sp-texto">{texto}</span> : null}
    </>
  );
  if (href)
    return (
      <Link href={href} className="siguiente-paso">
        {contenido}
      </Link>
    );
  return (
    <button
      type="button"
      className="siguiente-paso"
      onClick={() => {
        onClick?.();
        if (pestana) ir?.(pestana);
      }}
    >
      {contenido}
    </button>
  );
}

/** Fila con una o dos tarjetas «Siguiente paso». */
export function SiguientesPasos({ children }: { children: ReactNode }) {
  return <nav className="siguientes" aria-label="Siguiente paso">{children}</nav>;
}
