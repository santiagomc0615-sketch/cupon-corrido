/* Datos del reporte PDF. No calcula nada nuevo: toma las cifras del motor (lib/engine), del carry
   (lib/carry) y de la vista cliente (lib/cliente, que también lee el motor y lib/carry) y las
   ordena para el documento. Funciones puras. */
import { carryConConfig, type ConfigFondeo, type MercadoFondeo } from "@/lib/carry/config";
import { NOMBRE_FONDEO, type ResultadoCarry } from "@/lib/carry/fondeo";
import { posicionDesdeMotor } from "@/lib/carry/posicion";
import { TYPE_LBL } from "@/lib/calculadora";
import { resumenPortafolio, resumenTitulo, type ComparacionCDT, type ResumenCliente } from "@/lib/cliente";
import type { ClaveFuente, InfoFuente } from "@/lib/data/combinar";
import { pfMetrics, toS, type Bono, type ResultadoValoracion, type TipoBono } from "@/lib/engine";

export interface FuenteReporte {
  serie: string;
  fuente: string;
  fecha: string;
}

const NOMBRES: Partial<Record<ClaveFuente, string>> = {
  tpm: "Tasa de política",
  ibr: "IBR",
  uvr: "UVR",
  ipc: "IPC",
  tes: "Curva TES",
  trm: "TRM",
  dtf: "DTF (CDT)",
  sofr: "SOFR",
};

/** Fuentes y fechas de los datos de mercado que usa el reporte. */
export function fuentesReporte(fuentes: Partial<Record<ClaveFuente, InfoFuente>>, claves: ClaveFuente[]): FuenteReporte[] {
  return claves
    .map((k) => {
      const f = fuentes[k];
      return f ? { serie: NOMBRES[k] ?? k, fuente: f.fuente, fecha: f.hasta } : null;
    })
    .filter((x): x is FuenteReporte => x != null);
}

export interface FlujoReporte {
  fecha: string;
  cupon: number;
  capital: number;
}

/** Flujos futuros en pesos, separados en cupón y capital (filas del cronograma del motor). */
export function flujosReporte(b: Bono, o: ResultadoValoracion): FlujoReporte[] {
  const fx = o.fx || 1;
  const porFecha = new Map(o.cashCOP.map((c) => [c.n, c.cop]));
  return o.rows
    .filter((r) => r.N > 0)
    .map((r) => {
      // En UVR el motor ya trae el flujo en pesos proyectado (cashCOP); se reparte según cupón/capital.
      const total = porFecha.get(r.pay) ?? (r.L / 100) * b.nominal * fx;
      const kCap = r.L ? r.amort / r.L : 0;
      return { fecha: toS(r.pay), cupon: total * (1 - kCap), capital: total * kCap };
    });
}

/** Condición facial del título en palabras (cupón o spread según el tipo). */
export function condicionFacial(b: Bono): string {
  const p = (x: number) => (x * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " %";
  if (b.tipo === "TF") return `Cupón ${p(b.cupon)} E.A., ${b.frecuencia.toLowerCase()}`;
  if (b.tipo === "UVR") return `Cupón real ${p(b.cupon)}, ${b.frecuencia.toLowerCase()}`;
  if (b.tipo === "IPC") return `IPC + ${p(b.spread)}, ${b.frecuencia.toLowerCase()}`;
  return `IBR + ${p(b.spread)} N.A., ${b.frecuencia.toLowerCase()}`;
}

export interface ReporteTitulo {
  cliente: string;
  titulo: string;
  tipo: string;
  valoracion: string;
  emision: string;
  vencimiento: string;
  condicion: string;
  nominal: number;
  /** Del motor */
  tir: number;
  sucio: number;
  limpio: number;
  giro: number;
  duracionMod: number;
  macaulay: number;
  dv01: number;
  /** De lib/cliente (lee el motor y lib/carry con capital propio) */
  cliente_: ResumenCliente;
  cdt: ComparacionCDT | null;
  /** De lib/carry con el fondeo configurado (null si es capital propio o falta un dato) */
  carry: (ResultadoCarry & { tipo: string }) | null;
  flujos: FlujoReporte[];
  fuentes: FuenteReporte[];
}

export function armarReporteTitulo(p: {
  b: Bono;
  o: ResultadoValoracion;
  titulo: string;
  cliente?: string;
  fondeo?: ConfigFondeo | null;
  mercado?: MercadoFondeo | null;
  tasaCDT?: number | null;
  fuentes: Partial<Record<ClaveFuente, InfoFuente>>;
}): ReporteTitulo {
  const { b, o } = p;
  const r = resumenTitulo(b, o);
  const carry =
    p.fondeo && p.mercado && p.fondeo.tipo !== "propio" ? carryConConfig(posicionDesdeMotor(b, o), p.fondeo, p.mercado) : null;
  const claves: ClaveFuente[] = ["tpm", "ibr", "ipc", "uvr", "tes", "trm"];
  if (p.tasaCDT != null) claves.push("dtf");
  if (p.fondeo?.tipo === "exterior") claves.push("sofr");
  return {
    cliente: (p.cliente ?? "").trim(),
    titulo: p.titulo,
    tipo: TYPE_LBL[b.tipo],
    valoracion: b.valoracion,
    emision: b.emision,
    vencimiento: b.vencimiento,
    condicion: condicionFacial(b),
    nominal: b.nominal,
    tir: o.irr,
    sucio: o.dirty,
    limpio: o.clean,
    giro: o.giro,
    duracionMod: o.mod,
    macaulay: o.mac,
    dv01: o.dv01,
    cliente_: r,
    cdt: p.tasaCDT != null ? r.comparar(p.tasaCDT) : null,
    carry: carry && p.fondeo ? { ...carry, tipo: NOMBRE_FONDEO[p.fondeo.tipo] } : null,
    flujos: flujosReporte(b, o),
    fuentes: fuentesReporte(p.fuentes, claves),
  };
}

export interface PosicionReporte {
  titulo: string;
  tipo: TipoBono;
  nominal: number;
  tir: number;
  sucio: number;
  giro: number;
  duracionMod: number;
  dv01: number;
}

export interface ReportePortafolio {
  cliente: string;
  valoracion: string;
  valor: number;
  gananciaAnual: number;
  gananciaDiaria: number;
  tir: number;
  duracionMod: number;
  macaulay: number;
  dv01: number;
  composicion: { tipo: string; valor: number; peso: number }[];
  estres: { escenario: string; cambio: number; pct: number }[];
  posiciones: PosicionReporte[];
  colchonPb: number;
  fuentes: FuenteReporte[];
}

export function armarReportePortafolio(p: {
  posiciones: { b: Bono; o: ResultadoValoracion; titulo: string }[];
  valoracion: string;
  cliente?: string;
  fuentes: Partial<Record<ClaveFuente, InfoFuente>>;
}): ReportePortafolio | null {
  if (!p.posiciones.length) return null;
  const m = pfMetrics(p.posiciones.map((x) => ({ p: x.titulo, b: x.b, o: x.o })));
  const r = resumenPortafolio(p.posiciones)!;
  return {
    cliente: (p.cliente ?? "").trim(),
    valoracion: p.valoracion,
    valor: m.mv,
    gananciaAnual: r.gananciaAnual,
    gananciaDiaria: r.gananciaDiaria,
    tir: m.ytm,
    duracionMod: m.mod,
    macaulay: m.mac,
    dv01: m.dv01,
    composicion: (Object.entries(m.byType) as [TipoBono, number][]).map(([t, v]) => ({ tipo: TYPE_LBL[t], valor: v, peso: v / m.mv })),
    estres: m.stress.map(([escenario, cambio]) => ({ escenario, cambio, pct: cambio / m.mv })),
    posiciones: p.posiciones.map((x) => ({
      titulo: x.titulo,
      tipo: x.b.tipo,
      nominal: x.b.nominal,
      tir: x.o.tipo === "UVR" ? x.o.yieldCOP : x.o.irr,
      sucio: x.o.dirty,
      giro: x.o.giro,
      duracionMod: x.o.mod,
      dv01: x.o.dv01,
    })),
    colchonPb: r.colchonPb,
    fuentes: fuentesReporte(p.fuentes, ["tpm", "ibr", "ipc", "uvr", "tes", "trm"]),
  };
}
