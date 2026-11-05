/* Tipos del motor de valoración. Las tasas van en fracción decimal (0,1385 = 13,85 %),
   las fechas como texto ISO "AAAA-MM-DD" y los días internos como número de días desde 1970-01-01. */

export type Base = "365/365" | "Real/365" | "30/360" | "Real/360";
export type Frecuencia = "Mensual" | "Bimestral" | "Trimestral" | "Semestral" | "Anual";
export type Corrido = "Lineal" | "Compuesto";
export type Proyeccion = "IPC vigente" | "Expectativas";
export type Modalidad = "Inicio (Previo)" | "Final (Actual)";
export type MetodologiaIBR = "IBR vigente" | "Curva FRAC";
export type DescuentoIBR = "TIR con IBR promedio" | "Encadenado por periodo";
export type EstadoCupon = "Pagado" | "Vigente" | "Futuro";

/* ---------- Entradas ---------- */
interface BonoBase {
  nombre?: string;
  nominal: number;
  emision: string;
  vencimiento: string;
  frecuencia: Frecuencia;
  base: Base;
  valoracion: string;
}

export interface BonoTF extends BonoBase {
  tipo: "TF";
  cupon: number;
  tasaCompra: number;
  tasaVenta: number;
  corrido: Corrido;
}

export interface BonoIPC extends BonoBase {
  tipo: "IPC";
  spread: number;
  spreadCompra: number;
  spreadVenta: number;
  modalidad: Modalidad;
  proyeccion: Proyeccion;
  corrido: Corrido;
}

export interface BonoUVR extends BonoBase {
  tipo: "UVR";
  cupon: number;
  tasaCompra: number;
  tasaVenta: number;
  proyeccion: Proyeccion;
  corrido: Corrido;
}

export interface BonoIBR extends BonoBase {
  tipo: "IBR";
  spread: number;
  spreadCompra: number;
  spreadVenta: number;
  metodologia: MetodologiaIBR;
  descuento: DescuentoIBR;
  /** Precio sucio dado (% del nominal). 0 o ausente = se calcula. */
  precioDado?: number;
}

export type Bono = BonoTF | BonoIPC | BonoUVR | BonoIBR;
export type TipoBono = Bono["tipo"];

/* ---------- Cronograma ---------- */
export interface FilaCronograma {
  i: number;
  start: number;
  pay: number;
  /** Días del periodo según la base. */
  D: number;
  /** Días desde la valoración hasta el pago (0 si ya se pagó). */
  N: number;
  /** Años al pago (N / base). */
  t: number;
  estado: EstadoCupon;
  last: boolean;
  saldo: number;
  tasa: number;
  K: number;
  amort: number;
  L: number;
  COP: number;
  vp: number;
  vpV: number;
  // Campos propios de cada tipo de título
  J?: number;
  z?: number;
  vpZ?: number;
  ref?: number;
  H?: number;
  fuente?: string;
  infl?: number;
  uvrP?: number;
  cop?: number;
}

export interface Flujo {
  t: number;
  cf: number;
  n: number;
}

export interface FlujoCOP {
  n: number;
  cop: number;
}

export interface FilaSensibilidad {
  bp: number;
  r: number;
  real: number;
  eD: number;
  eDC: number;
  errD: number;
  errDC: number;
  dVal: number;
}

export type Nota = [string, number, string];

/* ---------- Resultados ---------- */
export interface Riesgo {
  mac: number;
  macDays: number;
  mod: number;
  durPesos: number;
  durPos: number;
  dv01: number;
  conv: number;
}

/** Lo que calcula cada valorador antes de `finish`. */
export interface PreResultado {
  tipo: TipoBono;
  rows: FilaCronograma[];
  flows: Flujo[];
  dirty: number;
  dirtyV: number;
  accrued: number;
  clean: number;
  cleanV: number;
  irr: number;
  irrV: number;
  nom: number;
  nomV: number;
  notas: Nota[];
  cashCOP?: FlujoCOP[];
  yieldCOP?: number;
}

/** Campos comunes que agrega `finish`. */
export interface Comunes extends Riesgo {
  cupones: number;
  pendientes: number;
  plazo: number;
  diasVto: number;
  ultimo: string;
  proximo: string;
  diasCorridos: number;
  diasPeriodo: number;
  cond: string;
  condV: string;
  giro: number;
  giroV: number;
  corridoCOP: number;
  limpioCOP: number;
  difGiro: number;
  sens: FilaSensibilidad[];
  fx: number;
  cashCOP: FlujoCOP[];
  yieldCOP: number;
  /** Aviso no bloqueante de la validación (o null). */
  aviso?: string | null;
}

/** PreResultado sin los campos que inish vuelve obligatorios. */
type ResultadoSinFinish = Omit<PreResultado, "cashCOP" | "yieldCOP">;

export interface ResultadoTF extends ResultadoSinFinish, Comunes {
  tipo: "TF";
  rendCorriente: number;
  pCurve: number;
  irrCurve: number;
  spreadCurve: number;
}

export interface ResultadoIPC extends ResultadoSinFinish, Comunes {
  tipo: "IPC";
  tasaNeg: number;
  tasaNegV: number;
  ipcVig: number;
  ipcMes: string;
  tirReal: number;
  tirRealV: number;
  tasaCupVig: number;
}

export interface ResultadoUVR extends ResultadoSinFinish, Comunes {
  tipo: "UVR";
  uvr: number;
  uvrFecha: string;
  uvrExtrap: boolean;
  ipcVig: number;
  tirPesos: number;
  fisher: number;
  rendCorriente: number;
  nominalCOP: number;
  tesDur: number;
  spreadUVR: number;
  spreadPesos: number;
}

export interface ResultadoIBR extends ResultadoSinFinish, Comunes {
  tipo: "IBR";
  ibrVig: number;
  ibrFecha: string;
  ibrStale: boolean;
  ibrAvg: number;
  plazoIBR: string;
  tasaNeg: number;
  tasaNegV: number;
  tasaNegEA: number;
  tasaNegEAV: number;
  fracStart: string;
  fracStale: boolean;
}

export type ResultadoValoracion = ResultadoTF | ResultadoIPC | ResultadoUVR | ResultadoIBR;

export interface ErrorValoracion {
  error: string;
}

export type Valoracion = ResultadoValoracion | ErrorValoracion;

export interface ResultadoVenta {
  pVenta: number;
  cupones: number;
  ncup: number;
  tir: number;
  gan: number;
  dias: number;
  retorno: number;
}

export const esError = (v: Valoracion | ResultadoVenta | ErrorValoracion): v is ErrorValoracion =>
  "error" in v;
