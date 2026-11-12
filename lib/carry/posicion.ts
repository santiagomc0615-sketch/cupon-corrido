/* Datos de una posición para el carry, leídos de la salida del motor (lib/engine no se modifica):
   precio sucio, valor de giro, TIR de compra, nominal, UVR (fx), DV01 y el periodo de cupón vigente.
   Función pura. */
import type { Bono, ResultadoValoracion } from "@/lib/engine";
import { tasaDiaria } from "./tasas";

export interface PosicionCarry {
  nominal: number;
  /** Precio sucio de compra, en % del nominal. */
  sucio: number;
  /** Multiplicador a pesos: la UVR de la valoración en títulos UVR; 1 en los demás. */
  fx: number;
  /** Valor de giro en pesos: sucio/100 × nominal × fx. */
  giro: number;
  /** TIR E.A. con la que causa en pesos (en UVR: la TIR en pesos, porque el giro está en pesos). */
  tir: number;
  /** DV01 en pesos. */
  dv01: number;
  proximoCupon: ProximoCupon | null;
}

export interface ProximoCupon {
  /** Fecha de pago (AAAA-MM-DD). */
  fecha: string;
  /** Días que faltan para el pago. */
  dias: number;
  /** Cupón del periodo vigente, en % del nominal (sin amortización). */
  pct: number;
  /** Cupón en pesos: pct/100 × nominal × fx. */
  cop: number;
  /** Capital que se paga con ese cupón, en % del nominal (100 en el último). */
  amortPct: number;
  /** Lo causado del periodo actual (cupón corrido), en % del nominal y en pesos. */
  causadoPct: number;
  causadoCop: number;
  /** Días corridos y días del periodo. */
  diasCorridos: number;
  diasPeriodo: number;
}

/** Arma los datos de carry de una valoración del motor. */
export function posicionDesdeMotor(b: Bono, o: ResultadoValoracion): PosicionCarry {
  const fx = o.fx || 1;
  const vigente = o.rows.find((r) => r.estado === "Vigente") ?? null;
  return {
    nominal: b.nominal,
    sucio: o.dirty,
    fx,
    giro: o.giro,
    tir: o.tipo === "UVR" ? o.yieldCOP : o.irr,
    dv01: o.dv01,
    proximoCupon: vigente
      ? {
          fecha: o.proximo,
          dias: vigente.N,
          pct: vigente.K,
          cop: (vigente.K / 100) * b.nominal * fx,
          amortPct: vigente.amort,
          causadoPct: o.accrued,
          causadoCop: o.corridoCOP,
          diasCorridos: o.diasCorridos,
          diasPeriodo: o.diasPeriodo,
        }
      : null,
  };
}

/** Causación diaria a TIR de compra: giro × ((1+TIR)^(1/365) − 1), en pesos y en % del giro. */
export function causacionDiaria(p: Pick<PosicionCarry, "giro" | "tir">) {
  const pct = tasaDiaria(p.tir);
  return { cop: p.giro * pct, pct };
}
