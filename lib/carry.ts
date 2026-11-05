/* Carry y roll-down a un horizonte (3, 6 o 12 meses), con el motor de valoración.
   - Carry: cupones cobrados hasta el horizonte + cambio de precio sucio manteniendo la misma tasa
     de negociación (TIR para TF/UVR, spread para IPC/IBR).
   - Roll-down (solo tasa fija): al acortarse el plazo, la TIR se desliza por la curva TES:
     TIR en el horizonte = TIR hoy + [spot(plazo en el horizonte) − spot(plazo hoy)].
   - Retornos sobre el valor de giro de hoy; los títulos UVR se miden en pesos (UVR proyectada). */
import { edate, esError, toN, toS, type Motor, type PosicionValorada } from "@/lib/engine";

export const HORIZONTES = [3, 6, 12] as const;
export type Horizonte = (typeof HORIZONTES)[number];

export interface CarryHorizonte {
  horizonte: Horizonte;
  /** Fecha del horizonte (ISO). */
  fecha: string;
  /** El título vence antes del horizonte: se mide hasta el vencimiento. */
  vence: boolean;
  /** Retornos del periodo (fracción del valor de hoy). */
  carry: number;
  roll: number | null;
  total: number;
  /** Retorno total anualizado (E.A.). */
  anual: number;
  /** Cambio de valor en pesos. */
  pesos: number;
}

export function carryPosicion<P>(motor: Motor, x: PosicionValorada<P>, h: Horizonte): CarryHorizonte | null {
  const { b, o } = x;
  const val = toN(b.valoracion),
    mat = toN(b.vencimiento);
  const n1 = Math.min(edate(val, h), mat);
  const vence = n1 >= mat;
  const fecha = toS(n1);
  const dias = n1 - val;
  if (dias <= 0) return null;

  const v0 = o.giro; // pesos
  const factorNominal = b.nominal / 100;

  // Cupones (y capital, si vence) cobrados en (hoy, horizonte], en pesos
  const cobrados = o.rows.filter((r) => r.pay > val && r.pay <= n1);
  const cupones = cobrados.reduce((s, r) => s + (b.tipo === "UVR" ? (r.cop ?? r.L * factorNominal * o.fx) : r.L * factorNominal), 0);

  let v1 = 0,
    v2: number | null = null;
  if (!vence) {
    const b1 = { ...b, valoracion: fecha };
    const o1 = motor.price(b1);
    if (esError(o1)) return null;
    v1 = o1.giro;
    if (b.tipo === "TF" && b1.tipo === "TF") {
      const t0 = (mat - val) / 365,
        t1 = (mat - n1) / 365;
      const desliz = motor.spot(t1) - motor.spot(t0);
      const o2 = motor.price({ ...b1, tasaCompra: b.tasaCompra + desliz });
      if (!esError(o2)) v2 = o2.giro;
    }
  }

  const carry = (v1 + cupones - v0) / v0;
  const roll = v2 == null ? (b.tipo === "TF" && !vence ? 0 : null) : (v2 - v1) / v0;
  const total = carry + (roll ?? 0);
  return {
    horizonte: h,
    fecha,
    vence,
    carry,
    roll,
    total,
    anual: Math.pow(1 + total, 365 / dias) - 1,
    pesos: total * v0,
  };
}

export function carryPortafolio<P>(motor: Motor, V: PosicionValorada<P>[]) {
  const filas = V.map((x) => ({ x, porH: HORIZONTES.map((h) => carryPosicion(motor, x, h)) }));
  const total = HORIZONTES.map((h, i) => {
    let v0 = 0,
      pesos = 0;
    for (const f of filas) {
      const c = f.porH[i];
      if (!c) continue;
      v0 += f.x.o.giro;
      pesos += c.pesos;
    }
    return { horizonte: h, pesos, total: v0 ? pesos / v0 : 0 };
  });
  return { filas, total };
}
