/* Retorno esperado a un horizonte (30, 90, 180 y 365 días) si la curva no se mueve. Funciones puras.
   No hay fórmulas de precio nuevas: toda valoración la hace el motor (motor.price) con el mismo
   título en la fecha del horizonte.
   - Causación: valor a la misma tasa de hoy en el horizonte − valor hoy + cupones cobrados en el
     periodo (lo que rinde el título si su tasa no cambia).
   - Roll-down: el título «rueda» a un plazo más corto. Tasa en el horizonte = TIR de la curva TES al
     plazo restante + el spread actual del título (TIR de hoy − TIR de la curva a su plazo de hoy).
     Ganancia = valor con esa tasa − valor con la tasa de hoy, ambos en la fecha del horizonte.
     Tasa fija: curva TES tasa fija. UVR: curva TES UVR si está cargada. IBR e IPC: no aplica (el
     cupón se ajusta al índice y no hay curva de spreads).
   - Costo de fondeo: el de lib/carry con la configuración del usuario (monto fondeado × tasa).
   - Total = causación + roll-down − costo de fondeo; % sobre el valor de giro de hoy y anualizado
     (E.A.). Los UVR se miden en pesos con la UVR proyectada por el motor. Sin reinversión. */
import { conTasa, tasaDe } from "@/lib/analisis/comunes";
import { esError, plazoTES, tirInterpolada, toN, toS, type Bono, type Motor, type ResultadoValoracion } from "@/lib/engine";

export const HORIZONTES_DIAS = [30, 90, 180, 365] as const;
export type HorizonteDias = (typeof HORIZONTES_DIAS)[number];

export interface CurvaRef {
  /** Fecha de la curva (para medir el plazo de las referencias). */
  fecha: string;
  /** [plazo en años, TIR E.A.] de las referencias. */
  refs: [number, number][];
}

export interface Retorno {
  dias: number;
  fecha: string;
  /** El título vence antes del horizonte: se mide hasta el vencimiento (sin roll-down). */
  vence: boolean;
  valorHoy: number;
  cupones: number;
  /** Cambio de valor a la misma tasa (sin los cupones). */
  cambioPrecio: number;
  causacion: number;
  /** null: no aplica a este tipo de título o no hay curva. */
  roll: number | null;
  costoFondeo: number;
  total: number;
  /** total / valor de hoy, del periodo y anualizado (E.A.). */
  pct: number;
  anual: number;
  /** Tasas usadas en el roll-down (en la unidad del título). */
  tasaHoy: number;
  tasaRoll: number | null;
  spread: number | null;
}

/** Curva que corresponde a un tipo de título (o null si no hay). */
export function curvaPara(tipo: Bono["tipo"], tf: CurvaRef, uvr: CurvaRef | null): CurvaRef | null {
  if (tipo === "TF") return tf;
  if (tipo === "UVR") return uvr && uvr.refs.length >= 2 ? uvr : null;
  return null;
}

const interp = (c: CurvaRef, t: number) => tirInterpolada([...c.refs].sort((a, b) => a[0] - b[0]), t);

export function retornoEsperado(
  motor: Pick<Motor, "price">,
  b: Bono,
  o: ResultadoValoracion,
  dias: number,
  curva: CurvaRef | null,
  /** Costo de fondeo del periodo en pesos (lib/carry). */
  costoFondeo: (dias: number) => number = () => 0,
): Retorno | { error: string } {
  const val = toN(b.valoracion),
    mat = toN(b.vencimiento);
  const n1 = Math.min(val + dias, mat);
  const d = n1 - val;
  if (d <= 0) return { error: "El título ya venció." };
  const vence = n1 >= mat;
  const fecha = toS(n1);
  const v0 = o.giro;
  const fxDe = (r: ResultadoValoracion["rows"][number]) => (o.tipo === "UVR" ? r.uvrP || o.fx : 1);
  const cupones = o.rows.filter((r) => r.pay > val && r.pay <= n1).reduce((s, r) => s + (r.L / 100) * b.nominal * fxDe(r), 0);

  const tasaHoy = tasaDe(b);
  let v1 = 0;
  let roll: number | null = null;
  let tasaRoll: number | null = null;
  let spread: number | null = null;
  if (!vence) {
    const o1 = motor.price(conTasa(b, tasaHoy, fecha));
    if (esError(o1)) return { error: o1.error };
    v1 = o1.giro;
    if (curva) {
      // Plazo restante en años (días reales / 365, la misma convención de las referencias de la curva)
      spread = tasaHoy - interp(curva, plazoTES(b.valoracion, b.vencimiento));
      tasaRoll = interp(curva, plazoTES(fecha, b.vencimiento)) + spread;
      const o2 = motor.price(conTasa(b, tasaRoll, fecha));
      if (!esError(o2)) roll = o2.giro - v1;
    }
  }
  const cambioPrecio = v1 - v0;
  const causacion = cambioPrecio + cupones;
  const costo = costoFondeo(d);
  const total = causacion + (roll ?? 0) - costo;
  const pct = v0 ? total / v0 : 0;
  return {
    dias: d,
    fecha,
    vence,
    valorHoy: v0,
    cupones,
    cambioPrecio,
    causacion,
    roll,
    costoFondeo: costo,
    total,
    pct,
    anual: 1 + pct > 0 ? Math.pow(1 + pct, 365 / d) - 1 : -1,
    tasaHoy,
    tasaRoll,
    spread,
  };
}

export interface RetornoPortafolio {
  dias: HorizonteDias;
  valorHoy: number;
  cupones: number;
  causacion: number;
  roll: number;
  costoFondeo: number;
  total: number;
  pct: number;
  anual: number;
}

/** Suma por horizonte de los retornos de cada posición (en pesos). */
export function sumarRetornos(filas: (Retorno | { error: string } | null)[][]): RetornoPortafolio[] {
  return HORIZONTES_DIAS.map((dias, i) => {
    const r = filas.map((f) => f[i]).filter((x): x is Retorno => !!x && !("error" in x));
    const s = (k: (x: Retorno) => number) => r.reduce((a, x) => a + k(x), 0);
    const valorHoy = s((x) => x.valorHoy);
    const total = s((x) => x.total);
    const pct = valorHoy ? total / valorHoy : 0;
    return {
      dias,
      valorHoy,
      cupones: s((x) => x.cupones),
      causacion: s((x) => x.causacion),
      roll: s((x) => x.roll ?? 0),
      costoFondeo: s((x) => x.costoFondeo),
      total,
      pct,
      anual: 1 + pct > 0 ? Math.pow(1 + pct, 365 / dias) - 1 : -1,
    };
  });
}
