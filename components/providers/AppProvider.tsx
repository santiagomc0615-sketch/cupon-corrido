"use client";
/* Estado compartido de la aplicación: motor con datos de mercado, calculadora, portafolio y avisos.
   Vive en el layout, así que se conserva al navegar entre secciones. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { crearMotor, esError, pfMetrics, type Motor, type PosicionValorada } from "@/lib/engine";
import type { SnapshotMercado } from "@/lib/data/mercado";
import { derivarMercado, type MercadoDerivado } from "@/lib/mercado-derivado";
import { CALC_INICIAL, PF_EJEMPLO, toEngine, type EstadoCalculadora, type Posicion } from "@/lib/calculadora";
import { useGuardado } from "@/lib/storage";

type Setter<T> = (v: T | ((p: T) => T)) => void;

interface App {
  snap: SnapshotMercado;
  motor: Motor;
  mk: MercadoDerivado;
  calc: EstadoCalculadora;
  setCalc: Setter<EstadoCalculadora>;
  pf: Posicion[];
  setPf: Setter<Posicion[]>;
  pfDate: string;
  setPfDate: Setter<string>;
  /** Posiciones valoradas a pfDate (sin las que dan error). */
  pfValorado: PosicionValorada<Posicion>[];
  pfMetricas: ReturnType<typeof pfMetrics> | null;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  toast: (texto: string) => void;
}

const Ctx = createContext<App | null>(null);

export function useApp(): App {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp debe usarse dentro de <AppProvider>");
  return c;
}

export function AppProvider({ snap, children }: { snap: SnapshotMercado; children: ReactNode }) {
  const motor = useMemo(() => crearMotor(snap.datos), [snap]);
  const mk = useMemo(() => derivarMercado(motor, snap), [motor, snap]);

  const [calc, setCalc] = useGuardado<EstadoCalculadora>("calc", CALC_INICIAL);
  const [pf, setPf] = useGuardado<Posicion[]>("pf", PF_EJEMPLO);
  const [pfDate, setPfDate] = useGuardado<string>("pfDate", snap.fechaAnalisis);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pfValorado = useMemo(
    () =>
      pf
        .map((p) => {
          const b = toEngine({ ...p.inputs, valoracion: pfDate });
          return { p, b, o: motor.price(b) };
        })
        .filter((x): x is PosicionValorada<Posicion> => !esError(x.o)),
    [pf, pfDate, motor],
  );
  const pfMetricas = useMemo(() => (pfValorado.length ? pfMetrics(pfValorado) : null), [pfValorado]);

  const [aviso, setAviso] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((texto: string) => {
    setAviso(texto);
    clearTimeout(t.current);
    t.current = setTimeout(() => setAviso(null), 2400);
  }, []);

  const valor: App = {
    snap,
    motor,
    mk,
    calc,
    setCalc,
    pf,
    setPf,
    pfDate,
    setPfDate,
    pfValorado,
    pfMetricas,
    editingId,
    setEditingId,
    toast,
  };

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="toast" role="status" hidden={!aviso}>
        {aviso}
      </div>
    </Ctx.Provider>
  );
}
