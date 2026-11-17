/* Semáforo de liquidez del título. Función pura.
   Tres señales, cada una verde (2), amarilla (1) o roja (0):
   - Bid-ask = |tasa de venta − tasa de compra| en pb. Verde ≤ 10 pb (rango típico de un TES de
     referencia), amarilla 10–30 pb (deuda privada de buen emisor), roja > 30 pb (poco negociado).
   - Monto emitido (opcional), en pesos. Verde ≥ 1 billón, amarilla 300 mil millones–1 billón,
     roja < 300 mil millones: emisiones pequeñas tienen pocos tenedores y poca rotación.
   - Referencia TES: los TES tasa fija de la curva de referencia son los títulos más negociados del
     mercado local; si lo es, esta señal es verde (si no, no suma ni resta).
   Resultado: promedio de las señales disponibles. ≥ 1,5 → alta (verde), ≥ 0,75 → media (amarilla),
   menos → baja (roja). Son umbrales académicos de referencia, no una medida oficial. */

export type Color = "verde" | "amarillo" | "rojo";

export interface Senal {
  nombre: string;
  color: Color;
  detalle: string;
}

export interface ResultadoLiquidez {
  color: Color;
  nivel: "Alta" | "Media" | "Baja";
  puntaje: number;
  bidAskPb: number;
  senales: Senal[];
}

export const UMBRALES = {
  bidAsk: { verde: 10, amarillo: 30 },
  monto: { verde: 1e12, amarillo: 3e11 },
} as const;

const PUNTOS: Record<Color, number> = { verde: 2, amarillo: 1, rojo: 0 };

export function colorBidAsk(pb: number): Color {
  return pb <= UMBRALES.bidAsk.verde ? "verde" : pb <= UMBRALES.bidAsk.amarillo ? "amarillo" : "rojo";
}

export function colorMonto(pesos: number): Color {
  return pesos >= UMBRALES.monto.verde ? "verde" : pesos >= UMBRALES.monto.amarillo ? "amarillo" : "rojo";
}

/**
 * @param tasaCompra, tasaVenta En fracción (0,136).
 * @param montoEmitido En pesos; null si no se conoce.
 * @param referenciaTES true si el título es un TES de referencia.
 */
export function semaforoLiquidez(p: { tasaCompra: number; tasaVenta: number; montoEmitido?: number | null; referenciaTES?: boolean }): ResultadoLiquidez {
  const bidAskPb = Math.abs(p.tasaVenta - p.tasaCompra) * 1e4;
  const senales: Senal[] = [
    { nombre: "Bid-ask", color: colorBidAsk(bidAskPb), detalle: `${bidAskPb.toLocaleString("es-CO", { maximumFractionDigits: 1 })} pb entre compra y venta` },
  ];
  if (p.montoEmitido != null && p.montoEmitido > 0) {
    senales.push({
      nombre: "Monto emitido",
      color: colorMonto(p.montoEmitido),
      detalle: `$ ${(p.montoEmitido / 1e9).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil millones`,
    });
  }
  if (p.referenciaTES) senales.push({ nombre: "Referencia TES", color: "verde", detalle: "Título de la curva de referencia" });
  const puntaje = senales.reduce((s, x) => s + PUNTOS[x.color], 0) / senales.length;
  const color: Color = puntaje >= 1.5 ? "verde" : puntaje >= 0.75 ? "amarillo" : "rojo";
  return { color, nivel: color === "verde" ? "Alta" : color === "amarillo" ? "Media" : "Baja", puntaje, bidAskPb, senales };
}

/** ¿El vencimiento coincide con un TES tasa fija de la curva cargada? (fechas AAAA-MM-DD) */
export function esReferenciaTES(tipo: string, vencimiento: string, vencimientosTES: string[]): boolean {
  return tipo === "TF" && vencimientosTES.includes(vencimiento);
}
