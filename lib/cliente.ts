/* Vista cliente: lo que un inversionista quiere ver de su título o portafolio, en pesos.
   No calcula nada nuevo: lee la valoración del motor (lib/engine) y el carry (lib/carry) con capital
   propio (sin fondeo), que es la situación de un cliente que invierte su dinero. Funciones puras.
   - Ganancia anual y diaria: causación a la TIR de compra sobre el valor de giro.
   - Colchón: ganancia de 365 días / DV01 → cuántos pb pueden subir las tasas antes de perder.
   - CDT al mismo plazo: giro × ((1 + tasa CDT)^(días/365) − 1) frente a giro × ((1 + TIR)^(días/365) − 1). */
import { calcularCarry } from "@/lib/carry/fondeo";
import { posicionDesdeMotor, type ProximoCupon } from "@/lib/carry/posicion";
import { tasaPeriodo } from "@/lib/carry/tasas";
import { toN, toS, type Bono, type ResultadoValoracion } from "@/lib/engine";

export interface PagoCliente {
  fecha: string;
  cop: number;
  /** Quién paga (en el portafolio, los títulos que pagan ese día). */
  titulos?: string[];
}

export interface ResumenCliente {
  giro: number;
  gananciaAnual: number;
  gananciaDiaria: number;
  /** TIR de compra (E.A.) con la que causa; en el portafolio, la equivalente sobre el giro total. */
  tir: number;
  proximo: (ProximoCupon & { progreso: number; titulo?: string }) | null;
  pagos: PagoCliente[];
  totalPagos: number;
  colchonPb: number;
  /** Días reales hasta el vencimiento (en el portafolio: promedio ponderado por giro). */
  plazoDias: number;
}

/** Componentes de una posición, para sumar en el portafolio. */
interface Parte extends ResumenCliente {
  dv01: number;
  /** Ganancia hasta el vencimiento a la TIR de compra. */
  gananciaPlazo: (tCDT: number) => { bono: number; cdt: number };
}

function parte(b: Bono, o: ResultadoValoracion, titulo?: string): Parte {
  const p = posicionDesdeMotor(b, o);
  const anual = calcularCarry(p, { tipo: "propio", haircut: 0 }, 0);
  const h365 = anual.horizontes.find((h) => h.dias === 365) ?? anual.horizontes[anual.horizontes.length - 1];
  const val = toN(b.valoracion);
  const pagos = o.cashCOP.filter((c) => c.n > val).map((c) => ({ fecha: toS(c.n), cop: c.cop, ...(titulo ? { titulos: [titulo] } : {}) }));
  const plazoDias = Math.max(0, toN(b.vencimiento) - val);
  const pc = p.proximoCupon;
  return {
    giro: p.giro,
    gananciaAnual: h365.causacion,
    gananciaDiaria: anual.causacionDia.cop,
    tir: p.tir,
    proximo: pc ? { ...pc, progreso: pc.diasPeriodo ? Math.min(1, Math.max(0, pc.diasCorridos / pc.diasPeriodo)) : 0, titulo } : null,
    pagos,
    totalPagos: pagos.reduce((s, x) => s + x.cop, 0),
    colchonPb: h365.colchonPb,
    plazoDias,
    dv01: p.dv01,
    gananciaPlazo: (tCDT) => ({ bono: p.giro * tasaPeriodo(p.tir, plazoDias), cdt: p.giro * tasaPeriodo(tCDT, plazoDias) }),
  };
}

export function resumenTitulo(b: Bono, o: ResultadoValoracion): ResumenCliente & { comparar: (tCDT: number) => ComparacionCDT } {
  const x = parte(b, o);
  return { ...x, comparar: (t) => comparacionCDT(x.gananciaPlazo(t), x.plazoDias, t) };
}

export interface ComparacionCDT {
  plazoDias: number;
  tasaCDT: number;
  bono: number;
  cdt: number;
  diferencia: number;
  ganaBono: boolean;
}

function comparacionCDT(g: { bono: number; cdt: number }, plazoDias: number, tasaCDT: number): ComparacionCDT {
  return { plazoDias, tasaCDT, ...g, diferencia: g.bono - g.cdt, ganaBono: g.bono >= g.cdt };
}

/** Portafolio: suma ganancias y pagos; el próximo cupón es el más cercano; el colchón usa el DV01 total;
    el CDT se compara título por título, cada uno a su propio plazo. */
export function resumenPortafolio(
  posiciones: { b: Bono; o: ResultadoValoracion; titulo: string }[],
): (ResumenCliente & { comparar: (tCDT: number) => ComparacionCDT }) | null {
  if (!posiciones.length) return null;
  const P = posiciones.map((x) => parte(x.b, x.o, x.titulo));
  const giro = P.reduce((s, x) => s + x.giro, 0);
  const gananciaAnual = P.reduce((s, x) => s + x.gananciaAnual, 0);
  const dv01 = P.reduce((s, x) => s + x.dv01, 0);
  const porFecha = new Map<string, PagoCliente>();
  for (const x of P)
    for (const p of x.pagos) {
      const a = porFecha.get(p.fecha);
      if (a) {
        a.cop += p.cop;
        a.titulos = [...(a.titulos ?? []), ...(p.titulos ?? [])];
      } else porFecha.set(p.fecha, { ...p, titulos: [...(p.titulos ?? [])] });
    }
  const pagos = [...porFecha.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const proximo = P.map((x) => x.proximo)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))[0] ?? null;
  const plazoDias = giro ? Math.round(P.reduce((s, x) => s + x.plazoDias * x.giro, 0) / giro) : 0;
  return {
    giro,
    gananciaAnual,
    gananciaDiaria: P.reduce((s, x) => s + x.gananciaDiaria, 0),
    tir: giro ? gananciaAnual / giro : 0,
    proximo,
    pagos,
    totalPagos: pagos.reduce((s, x) => s + x.cop, 0),
    colchonPb: dv01 ? gananciaAnual / dv01 : 0,
    plazoDias,
    comparar: (t) => {
      const g = P.map((x) => x.gananciaPlazo(t));
      return comparacionCDT({ bono: g.reduce((s, x) => s + x.bono, 0), cdt: g.reduce((s, x) => s + x.cdt, 0) }, plazoDias, t);
    },
  };
}
