"use client";
/* Interruptor «Vista cliente» (calculadora y portafolio comparten el estado, guardado en el navegador)
   y las vistas ya armadas para un título y para el portafolio. */
import { useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { resumenPortafolio, resumenTitulo } from "@/lib/cliente";
import type { Bono, ResultadoValoracion } from "@/lib/engine";
import { useGuardado, useHidratado } from "@/lib/storage";
import { VistaCliente } from "./VistaCliente";

export function useVistaCliente() {
  const [activa, fijar] = useGuardado<boolean>("vistaCliente", false);
  const hidratado = useHidratado();
  return [hidratado && activa, fijar] as const;
}

export function InterruptorCliente() {
  const [activa, fijar] = useVistaCliente();
  return (
    <div className="seg" role="group" aria-label="Vista cliente">
      <button type="button" aria-pressed={activa} onClick={() => fijar(!activa)} title="Resumen en grande para mostrar a un cliente">
        Vista cliente
      </button>
    </div>
  );
}

export function ClienteTitulo({ b, o, nombre }: { b: Bono; o: ResultadoValoracion; nombre: string }) {
  const r = useMemo(() => resumenTitulo(b, o), [b, o]);
  return <VistaCliente resumen={r} titulo={nombre} comparar={r.comparar} />;
}

export function ClientePortafolio() {
  const { pfValorado } = useApp();
  const r = useMemo(
    () => resumenPortafolio(pfValorado.map((x) => ({ b: x.b, o: x.o, titulo: String(x.p.inputs.nombre) }))),
    [pfValorado],
  );
  if (!r) return null;
  return <VistaCliente resumen={r} titulo={`Portafolio · ${pfValorado.length} títulos`} comparar={r.comparar} />;
}
