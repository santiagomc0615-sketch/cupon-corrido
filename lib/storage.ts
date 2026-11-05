"use client";
/* Estado persistido en localStorage (prefijo cc_, igual que el prototipo).
   Usa useSyncExternalStore: en el servidor y durante la hidratación devuelve el valor por
   defecto y luego cambia al guardado, sin errores de hidratación. */
import { useCallback, useSyncExternalStore } from "react";

const PREFIJO = "cc_";
const oyentes = new Set<() => void>();
const memoria = new Map<string, unknown>();

function leer<T>(clave: string, porDefecto: T): T {
  if (memoria.has(clave)) return memoria.get(clave) as T;
  let v: T = porDefecto;
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (crudo) v = JSON.parse(crudo) as T;
  } catch {
    /* almacenamiento bloqueado o dato corrupto: se usa el valor por defecto */
  }
  memoria.set(clave, v);
  return v;
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIJO)) {
      memoria.delete(e.key.slice(PREFIJO.length));
      cb();
    }
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

/** `porDefecto` debe ser estable (una constante de módulo), no un objeto nuevo en cada render. */
export function useGuardado<T>(clave: string, porDefecto: T) {
  const valor = useSyncExternalStore(
    suscribir,
    () => leer(clave, porDefecto),
    () => porDefecto,
  );
  const fijar = useCallback(
    (v: T | ((previo: T) => T)) => {
      const previo = leer(clave, porDefecto);
      const nuevo = typeof v === "function" ? (v as (p: T) => T)(previo) : v;
      memoria.set(clave, nuevo);
      try {
        localStorage.setItem(PREFIJO + clave, JSON.stringify(nuevo));
      } catch {
        /* sin almacenamiento: el valor vive solo en esta sesión */
      }
      oyentes.forEach((o) => o());
    },
    [clave, porDefecto],
  );
  return [valor, fijar] as const;
}

const noSuscribir = () => () => {};
/** true en el navegador después de hidratar; false en el servidor. */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    noSuscribir,
    () => true,
    () => false,
  );
}
