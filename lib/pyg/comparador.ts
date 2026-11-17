/* Comparador CDT vs. TES TF, bono IBR, bono IPC y TES UVR al mismo plazo y monto, mantenidos al
   vencimiento, con impuestos e inflación. Cada título lo valora el motor (lib/engine sin tocar):
   - TES TF a la TIR de la curva TES interpolada al plazo (cupón = TIR, precio ≈ par).
   - IBR, IPC y UVR con el spread o la TIR real del ejemplo de la calculadora (editables).
   - CDT: interés compuesto a la tasa E.A. dada, pagado al vencimiento.
   Escenarios: se crea otro motor con los datos de mercado movidos (curva FRAC del IBR ±100 pb;
   expectativas de inflación ±200 pb) y se recalcula todo, incluida la inflación del periodo. Como el
   motor proyecta el IPC y la UVR con el último dato publicado, en los escenarios de inflación los
   flujos indexados se ajustan en lib/pyg/desde-motor.ts (deltaInflacion). */
import { crearDefaults, toEngine, type EntradasUI } from "@/lib/calculadora";
import { crearMotor, esError, tirInterpolada, toN, toS, type DatosMercado, type TipoBono } from "@/lib/engine";
import type { ParametrosTributarios } from "@/lib/impuestos/parametros";
import type { PerfilContribuyente } from "@/lib/impuestos/perfil";
import { entradasDesdeMotor } from "./desde-motor";
import { estadoPyG, type EntradasPyG, type ResultadoPyG } from "./estado";
import { inflacionEntre } from "./inflacion";

export type Opcion = "CDT" | TipoBono;

export const NOMBRE_OPCION: Record<Opcion, string> = { CDT: "CDT", TF: "TES tasa fija", IBR: "Bono IBR", IPC: "Bono IPC", UVR: "TES UVR" };

export const RIESGO: Record<Opcion, { precio: string; liquidez: string }> = {
  CDT: { precio: "No fluctúa si se mantiene; no se puede redimir antes del vencimiento (solo vender en el mercado secundario)", liquidez: "Baja antes del vencimiento" },
  TF: { precio: "Fluctúa con las tasas: sube si bajan, cae si suben (según la duración)", liquidez: "Alta en las referencias TES" },
  IBR: { precio: "Fluctúa poco: el cupón se ajusta con el IBR", liquidez: "Media (deuda privada)" },
  IPC: { precio: "Fluctúa con la tasa real; protege contra la inflación", liquidez: "Media a baja (deuda privada)" },
  UVR: { precio: "Fluctúa con la tasa real; capital indexado a la UVR", liquidez: "Media (menor que los TES TF)" },
};

export interface EntradasComparador {
  monto: number;
  plazoAnios: number;
  fecha: string;
  tasaCDT: number;
  spreadIBR?: number;
  spreadIPC?: number;
  tirRealUVR?: number;
}

export interface FilaComparador {
  opcion: Opcion;
  tasa: string;
  pyg: ResultadoPyG | null;
  duracion: number | null;
  error?: string;
}

export interface Escenario {
  id: string;
  nombre: string;
  /** Movimiento de las tasas de interés (pb) y de la inflación esperada (pb). */
  tasasPb: number;
  inflacionPb: number;
}

export const ESCENARIOS: Escenario[] = [
  { id: "bajan", nombre: "Tasas bajan 100 pb", tasasPb: -100, inflacionPb: 0 },
  { id: "estables", nombre: "Tasas estables", tasasPb: 0, inflacionPb: 0 },
  { id: "suben", nombre: "Tasas suben 100 pb", tasasPb: 100, inflacionPb: 0 },
  { id: "inflAlta", nombre: "Inflación alta (+2 pp)", tasasPb: 0, inflacionPb: 200 },
  { id: "inflBaja", nombre: "Inflación baja (−2 pp)", tasasPb: 0, inflacionPb: -200 },
];

/** Datos de mercado con la curva FRAC (IBR futuro) y las expectativas de inflación movidas. */
export function moverDatos(d: DatosMercado, tasasPb: number, inflacionPb: number): DatosMercado {
  if (!tasasPb && !inflacionPb) return d;
  const dt = tasasPb / 1e4,
    di = inflacionPb / 1e4;
  return {
    ...d,
    frac: d.frac.map(([f, v]) => [f, v + dt]),
    curvasFrac: d.curvasFrac?.map((c) => (c.datos ? { ...c, datos: c.datos.map(([f, v]) => [f, v + dt] as [string, number]) } : c)),
    exp: d.exp.map(([f, v]) => [f, v + di]),
  };
}

const sumarAnios = (fecha: string, anios: number) => toS(toN(fecha) + Math.round(anios * 365.25));

/** P&G de cada opción mantenida al vencimiento con unos datos de mercado. */
export function compararOpciones(d: DatosMercado, e: EntradasComparador, perfil: PerfilContribuyente, p: ParametrosTributarios, deltaInflacion = 0): FilaComparador[] {
  const motor = crearMotor(d);
  const venc = sumarAnios(e.fecha, e.plazoAnios);
  const def = crearDefaults(e.fecha);
  const refs = d.tes.map((r) => [r[4], r[3]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const tirTF = tirInterpolada(refs, e.plazoAnios);
  const comun = { emision: e.fecha, vencimiento: venc, valoracion: e.fecha };
  const uvrHoy = motor.uvrAt(toN(e.fecha)).v;
  const pct = (x: number) => (x * 100).toFixed(2).replace(".", ",") + " %";
  const sIBR = e.spreadIBR ?? Number(def.IBR.spreadCompra);
  const sIPC = e.spreadIPC ?? Number(def.IPC.spreadCompra);
  const rUVR = e.tirRealUVR ?? Number(def.UVR.tasaCompra);
  const bonos: [TipoBono, EntradasUI, string][] = [
    ["TF", { ...def.TF, ...comun, nominal: e.monto, cupon: +(tirTF * 100).toFixed(4), tasaCompra: +(tirTF * 100).toFixed(4) }, `TIR curva ${pct(tirTF)}`],
    ["IBR", { ...def.IBR, ...comun, nominal: e.monto, spread: sIBR, spreadCompra: sIBR, metodologia: "Curva FRAC" }, `IBR + ${String(sIBR).replace(".", ",")} %`],
    ["IPC", { ...def.IPC, ...comun, nominal: e.monto, spread: sIPC, spreadCompra: sIPC }, `IPC + ${String(sIPC).replace(".", ",")} %`],
    ["UVR", { ...def.UVR, ...comun, nominal: e.monto / uvrHoy, cupon: rUVR, tasaCompra: rUVR }, `UVR + ${String(rUVR).replace(".", ",")} %`],
  ];
  const filas: FilaComparador[] = [];
  // CDT
  const dias = toN(venc) - toN(e.fecha);
  const inf = inflacionEntre(d.ipc, d.exp, e.fecha, venc);
  const cdt: EntradasPyG = {
    fechaCompra: e.fecha,
    fechaVenta: venc,
    capital: e.monto,
    limpioCompra: e.monto,
    corridoCompra: 0,
    limpioVenta: 0,
    corridoVenta: 0,
    cupones: [{ fecha: venc, interes: e.monto * (Math.pow(1 + e.tasaCDT, dias / 365) - 1), amort: e.monto }],
    costoFondeo: 0,
    comisiones: 0,
    inflacion: inf.acumulada,
    inflacionProyectada: inf.proyectada,
    indexado: false,
  };
  filas.push({ opcion: "CDT", tasa: `${pct(e.tasaCDT)} E.A.`, pyg: estadoPyG(cdt, perfil, p), duracion: null });
  for (const [t, ui, tasa] of bonos) {
    const b = toEngine(ui);
    const o = motor.price(b);
    if (esError(o)) {
      filas.push({ opcion: t, tasa, pyg: null, duracion: null, error: o.error });
      continue;
    }
    const en = entradasDesdeMotor(motor, b, o, { alVencimiento: true, deltaInflacion }, { ipc: d.ipc, exp: d.exp });
    if ("error" in en) {
      filas.push({ opcion: t, tasa, pyg: null, duracion: null, error: en.error });
      continue;
    }
    filas.push({ opcion: t, tasa, pyg: estadoPyG(en, perfil, p), duracion: o.mod });
  }
  return filas;
}

export interface ResultadoEscenario {
  escenario: Escenario;
  /** Utilidad real neta por opción. */
  reales: Partial<Record<Opcion, number>>;
  ganador: Opcion | null;
}

/** Utilidad real neta de cada opción en cada escenario y cuál gana. */
export function escenariosComparador(d: DatosMercado, e: EntradasComparador, perfil: PerfilContribuyente, p: ParametrosTributarios): ResultadoEscenario[] {
  return ESCENARIOS.map((esc) => {
    const filas = compararOpciones(moverDatos(d, esc.tasasPb, esc.inflacionPb), e, perfil, p, esc.inflacionPb / 1e4);
    const reales: Partial<Record<Opcion, number>> = {};
    for (const f of filas) if (f.pyg) reales[f.opcion] = f.pyg.real;
    const orden = (Object.entries(reales) as [Opcion, number][]).sort((a, b) => b[1] - a[1]);
    return { escenario: esc, reales, ganador: orden[0]?.[0] ?? null };
  });
}
