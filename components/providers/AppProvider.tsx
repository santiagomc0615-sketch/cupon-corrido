"use client";
/* Estado compartido de la aplicación: motor con datos de mercado, calculadora, portafolio y avisos.
   Vive en el layout, así que se conserva al navegar entre secciones.
   Las curvas FRAC cargadas se descargan solo cuando una valoración las necesita.
   Las series que carga el usuario (curva FRAC y expectativas de inflación, lib/cargas-usuario) se
   guardan en el navegador y el motor las recibe en sus datos (lib/engine no cambia). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  crearMotor,
  esError,
  pfMetrics,
  toN,
  type DatosMercado,
  type Motor,
  type PosicionValorada,
  type TipoBono,
  type TuplaFecha,
} from "@/lib/engine";
import type { SnapshotMercado } from "@/lib/data/mercado";
import { derivarMercado, type MercadoDerivado } from "@/lib/mercado-derivado";
import {
  crearDefaults,
  crearPfEjemplo,
  toEngine,
  type EntradasUI,
  type EstadoCalculadora,
  type Posicion,
} from "@/lib/calculadora";
import { conDatosUsuario, datosValidos, desdeVersionAnterior, ID_CURVA_USUARIO, SIN_DATOS_USUARIO, type DatosUsuario, type SerieUsuario } from "@/lib/cargas-usuario/datos";
import type { TipoSerieUsuario } from "@/lib/cargas-usuario/lector";
import { useGuardado } from "@/lib/storage";

type Setter<T> = (v: T | ((p: T) => T)) => void;
type EstadoCurva = "descargando" | "lista" | "error";

interface App {
  snap: SnapshotMercado;
  motor: Motor;
  /** Datos con los que se armó el motor (incluye las curvas FRAC ya descargadas). */
  datosMotor: DatosMercado;
  mk: MercadoDerivado;
  /** Títulos de ejemplo valorados en la fecha de análisis. */
  defaults: Record<TipoBono, EntradasUI>;
  pfEjemplo: Posicion[];
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
  /** Estado de descarga de cada curva FRAC cargada. */
  curvas: Record<string, EstadoCurva>;
  /** Pide descargar una curva FRAC (no hace nada si ya está o es la del Excel). */
  pedirCurva: (id: string) => void;
  /** Series cargadas por el usuario (guardadas en el navegador): curva FRAC y expectativas. */
  datosUsuario: DatosUsuario;
  /** Guarda la serie y la elige en la calculadora (FRAC: IBR con «Curva FRAC»; expectativas: IPC/UVR con «Expectativas»). */
  usarDatosUsuario: (s: SerieUsuario) => void;
  /** Borra la serie del usuario y vuelve a los datos por defecto. */
  quitarDatosUsuario: (tipo: TipoSerieUsuario) => void;
}

const Ctx = createContext<App | null>(null);

export function useApp(): App {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp debe usarse dentro de <AppProvider>");
  return c;
}

/** Pide la curva FRAC que necesita una valoración IBR con "Curva FRAC" (o la de venta). */
export function useCurvaNecesaria(id: string | null | undefined) {
  const { pedirCurva } = useApp();
  useEffect(() => {
    if (id) pedirCurva(id);
  }, [id, pedirCurva]);
}

export function AppProvider({ snap, children }: { snap: SnapshotMercado; children: ReactNode }) {
  const defaults = useMemo(() => crearDefaults(snap.fechaAnalisis), [snap.fechaAnalisis]);
  const pfEjemplo = useMemo(() => crearPfEjemplo(defaults), [defaults]);
  const calcInicial = useMemo<EstadoCalculadora>(() => ({ type: "TF", inputs: defaults }), [defaults]);

  const [calc, setCalc] = useGuardado<EstadoCalculadora>("calc", calcInicial);
  const [pf, setPf] = useGuardado<Posicion[]>("pf", pfEjemplo);
  const [pfDate, setPfDate] = useGuardado<string>("pfDate", snap.fechaAnalisis);

  /* ---- Series del usuario (curva FRAC y expectativas) ---- */
  const [guardados, setGuardados] = useGuardado<DatosUsuario>("datosUsuario-v1", SIN_DATOS_USUARIO);
  const [anterior, setAnterior] = useGuardado<unknown>("curvaFracUsuario", null);
  useEffect(() => {
    // Curva guardada por la versión anterior del botón: se pasa al formato nuevo una sola vez.
    if (anterior == null) return;
    const s = desdeVersionAnterior(anterior);
    if (s) setGuardados((g) => (g.frac ? g : { ...g, frac: s }));
    setAnterior(null);
  }, [anterior, setAnterior, setGuardados]);
  const datosUsuario = useMemo(() => datosValidos(guardados), [guardados]);

  /* ---- Curvas FRAC descargadas bajo demanda ---- */
  const [descargadas, setDescargadas] = useState<Record<string, TuplaFecha[]>>({});
  const [curvas, setCurvas] = useState<Record<string, EstadoCurva>>({});
  const pedidas = useRef(new Set<string>());
  const conocidas = useMemo(() => new Set((snap.datos.curvasFrac ?? []).map((c) => c.id)), [snap.datos.curvasFrac]);
  const pedirCurva = useCallback(
    (id: string) => {
      if (!conocidas.has(id) || pedidas.current.has(id)) return;
      pedidas.current.add(id);
      setCurvas((e) => ({ ...e, [id]: "descargando" }));
      fetch(`/api/datos/curva?id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then((c: { datos: TuplaFecha[] }) => {
          setDescargadas((d) => ({ ...d, [id]: c.datos }));
          setCurvas((e) => ({ ...e, [id]: "lista" }));
        })
        .catch(() => {
          pedidas.current.delete(id);
          setCurvas((e) => ({ ...e, [id]: "error" }));
        });
    },
    [conocidas],
  );

  const datosMotor = useMemo<DatosMercado>(
    () =>
      conDatosUsuario(
        {
          ...snap.datos,
          curvasFrac: (snap.datos.curvasFrac ?? []).map((c) => ({ ...c, datos: descargadas[c.id] })),
        },
        datosUsuario,
      ),
    [snap.datos, descargadas, datosUsuario],
  );
  const motor = useMemo(() => crearMotor(datosMotor), [datosMotor]);
  const mk = useMemo(() => derivarMercado(motor, snap), [motor, snap]);

  const [editingId, setEditingId] = useState<string | null>(null);

  // Curvas FRAC que necesitan las posiciones IBR del portafolio
  const curvasPf = useMemo(
    () =>
      pf
        .filter((p) => p.inputs.tipo === "IBR" && p.inputs.metodologia === "Curva FRAC")
        .map((p) => motor.elegirCurvaFrac(toN(pfDate), (p.inputs.curvaFrac as string) || undefined))
        .filter((c) => !c.serie)
        .map((c) => c.id),
    [pf, pfDate, motor],
  );
  useEffect(() => {
    curvasPf.forEach(pedirCurva);
  }, [curvasPf, pedirCurva]);

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

  const usarDatosUsuario = useCallback(
    (serie: SerieUsuario) => {
      setGuardados((g) => ({ ...g, [serie.tipo]: serie }));
      setCalc((e) => {
        if (serie.tipo === "frac") return { ...e, inputs: { ...e.inputs, IBR: { ...e.inputs.IBR, metodologia: "Curva FRAC", curvaFrac: ID_CURVA_USUARIO } } };
        // Expectativas: el título IPC o UVR abierto pasa a proyectar con «Expectativas».
        return e.type === "IPC" || e.type === "UVR" ? { ...e, inputs: { ...e.inputs, [e.type]: { ...e.inputs[e.type], proyeccion: "Expectativas" } } } : e;
      });
    },
    [setGuardados, setCalc],
  );
  const quitarDatosUsuario = useCallback(
    (tipo: TipoSerieUsuario) => {
      if (tipo === "frac") {
        const sinUsuario = (e: EntradasUI): EntradasUI => (e.curvaFrac === ID_CURVA_USUARIO ? { ...e, curvaFrac: "" } : e);
        setCalc((e) => ({
          ...e,
          inputs: { ...e.inputs, IBR: sinUsuario(e.inputs.IBR) },
          ...(e.hv?.curva === ID_CURVA_USUARIO ? { hv: { ...e.hv, curva: "" } } : {}),
        }));
        setPf((xs) => (xs.some((p) => p.inputs.curvaFrac === ID_CURVA_USUARIO) ? xs.map((p) => ({ ...p, inputs: sinUsuario(p.inputs) })) : xs));
      }
      setGuardados((g) => ({ ...g, [tipo]: null }));
    },
    [setCalc, setPf, setGuardados],
  );

  const valor: App = {
    snap,
    motor,
    datosMotor,
    mk,
    defaults,
    pfEjemplo,
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
    curvas,
    pedirCurva,
    datosUsuario,
    usarDatosUsuario,
    quitarDatosUsuario,
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
