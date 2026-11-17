/* Arma las entradas del P&G con el motor (sin tocar lib/engine): precio y cupón corrido de compra
   de la valoración; cupones cobrados del cronograma; precio de venta repreciando el mismo título en
   la fecha de venta con la tasa de venta (o el vencimiento); fondeo con lib/carry. */
import { conTasa, tasaDe } from "@/lib/analisis/comunes";
import { montos } from "@/lib/carry/fondeo";
import { tasaEfectiva, type ConfigFondeo, type MercadoFondeo } from "@/lib/carry/config";
import { esError, toN, toS, type Bono, type Motor, type ResultadoValoracion, type TuplaFecha, type TuplaIPC } from "@/lib/engine";
import type { CuponRecibido, EntradasPyG } from "./estado";
import { inflacionEntre } from "./inflacion";

export interface OpcionesVenta {
  /** Fecha de venta; ignorada si `alVencimiento`. */
  fechaVenta?: string;
  /** Tasa de venta en la misma unidad que la de compra (TIR, TIR real o spread), fracción. */
  tasaVenta?: number;
  alVencimiento?: boolean;
  /** Precio sucio de venta ya calculado (%, p. ej. el de «Simular venta»); manda sobre `tasaVenta`. */
  sucioVenta?: number;
  comisiones?: number;
  costoFondeo?: number;
  /** Escenario: inflación anual distinta a la que proyecta el motor (fracción, p. ej. 0,02).
      El motor proyecta el IPC y la UVR con el último dato publicado, así que el ajuste se hace aquí:
      UVR, cada flujo × (1 + Δ)^t; IPC, cada cupón futuro + nominal × Δ × (1 + spread) × fracción del periodo. */
  deltaInflacion?: number;
}

/** Costo del fondeo de una posición durante `dias` con la configuración del usuario. */
export function costoFondeo(giro: number, c: ConfigFondeo | null, m: MercadoFondeo, dias: number): number {
  if (!c || c.tipo === "propio" || dias <= 0) return 0;
  const t = tasaEfectiva(c, m);
  if (t == null) return 0;
  return montos(giro, c).fondeado * (Math.pow(1 + t, dias / 365) - 1);
}

export function entradasDesdeMotor(
  motor: Pick<Motor, "price">,
  b: Bono,
  o: ResultadoValoracion,
  v: OpcionesVenta,
  inflacion: { ipc: TuplaIPC[]; exp: TuplaFecha[] },
): EntradasPyG | { error: string } {
  const val = toN(b.valoracion);
  const fechaVenta = v.alVencimiento ? b.vencimiento : v.fechaVenta;
  if (!fechaVenta) return { error: "Falta la fecha de venta." };
  const sv = toN(fechaVenta);
  if (!(sv > val)) return { error: "La fecha de venta debe ser posterior a la compra." };
  if (sv > toN(b.vencimiento)) return { error: "La venta debe ser antes del vencimiento." };
  const peso = (fx: number) => (b.nominal / 100) * fx;
  const fxDe = (r: ResultadoValoracion["rows"][number]) => (o.tipo === "UVR" ? r.uvrP || o.fx : 1);

  const di = v.deltaInflacion ?? 0;
  const cupones: CuponRecibido[] = o.rows
    .filter((r) => r.pay > val && r.pay <= sv)
    .map((r) => {
      let interes = (r.K / 100) * b.nominal * fxDe(r),
        amort = (r.amort / 100) * b.nominal * fxDe(r);
      if (di && o.tipo === "UVR") {
        const f = Math.pow(1 + di, (r.pay - val) / 365);
        interes *= f;
        amort *= f;
      } else if (di && b.tipo === "IPC" && r.start > val && r.tasa > 0) {
        interes += b.nominal * di * (1 + b.spread) * (r.K / 100 / r.tasa);
      }
      return { fecha: toS(r.pay), interes, amort };
    });

  let limpioVenta = 0,
    corridoVenta = 0;
  if (!v.alVencimiento && sv < toN(b.vencimiento)) {
    if (v.tasaVenta == null && v.sucioVenta == null) return { error: "Falta la tasa de venta." };
    // Con el precio sucio dado, el motor solo aporta el cupón corrido y la UVR de esa fecha.
    const o2 = motor.price(conTasa(b, v.tasaVenta ?? tasaDe(b), fechaVenta));
    if (esError(o2)) return { error: o2.error };
    const sucio = v.sucioVenta ?? o2.dirty;
    limpioVenta = (sucio - o2.accrued) * peso(o2.fx || 1);
    corridoVenta = o2.accrued * peso(o2.fx || 1);
  }
  const inf = inflacionEntre(inflacion.ipc, inflacion.exp, b.valoracion, fechaVenta);
  return {
    fechaCompra: b.valoracion,
    fechaVenta,
    capital: o.giro,
    limpioCompra: o.clean * peso(o.fx || 1),
    corridoCompra: o.accrued * peso(o.fx || 1),
    limpioVenta,
    corridoVenta,
    cupones,
    costoFondeo: v.costoFondeo ?? 0,
    comisiones: v.comisiones ?? 0,
    inflacion: inf.acumulada,
    inflacionProyectada: inf.proyectada,
    indexado: o.tipo === "IPC" || o.tipo === "UVR",
  };
}
