/* Escenarios de política monetaria: "si el BanRep mueve la tasa X pb", cuánto cambia el valor de
   cada posición con revaloración completa. Supuestos explícitos y editables:
   - La curva TES se mueve X × traspaso, con traspaso que va del corto plazo (≤ 1 año) al largo
     (≥ 10 años) por interpolación lineal según la duración de cada título.
   - Tasa fija (TF): TIR + Δcurva(duración).
   - UVR: TIR real + Δcurva(duración) (las expectativas de inflación se suponen estables).
   - IPC: spread de negociación + Δcurva(duración); el IPC publicado no cambia.
   - IBR: el IBR proyectado (vigente o curva FRAC) se mueve X × traspaso IBR; cupones futuros y
     descuento se recalculan con el motor. Los cupones ya fijados no cambian. */
import {
  crearMotor,
  esError,
  pvAt,
  toN,
  toS,
  type DatosMercado,
  type PosicionValorada,
  type TipoBono,
  type TuplaIBR,
} from "@/lib/engine";

export interface SupuestosEscenario {
  /** Cambio de la tasa de política en pb (negativo = recorte). */
  pb: number;
  /** Traspaso a la curva TES en el corto plazo (≤ 1 año), fracción. */
  corto: number;
  /** Traspaso a la curva TES en el largo plazo (≥ 10 años), fracción. */
  largo: number;
  /** Traspaso al IBR, fracción. */
  ibr: number;
}

export const SUPUESTOS_INICIALES: SupuestosEscenario = { pb: -50, corto: 0.8, largo: 0.3, ibr: 1 };

/** Cambio de la curva TES (en pb) para un plazo o duración t en años. */
export function deltaCurva(s: SupuestosEscenario, t: number): number {
  const w = t <= 1 ? 0 : t >= 10 ? 1 : (t - 1) / 9;
  return s.pb * (s.corto + (s.largo - s.corto) * w);
}

export interface FilaEscenario<P> {
  p: P;
  tipo: TipoBono;
  /** Cambio de tasa aplicado en pb (curva, spread real o IBR). */
  deltaPb: number;
  /** Qué se movió, en palabras. */
  supuesto: string;
  valor0: number;
  valor1: number;
  delta: number;
  deltaPct: number;
}

/** Datos de mercado con el IBR (y las curvas FRAC) movidos por el escenario a partir de la fecha. */
export function mercadoConIBR(datos: DatosMercado, fecha: string, deltaFrac: number): DatosMercado {
  if (!deltaFrac) return datos;
  const n = toN(fecha);
  const ayer = toS(n - 1);
  const previas = datos.ibr.filter((r) => r[0] < ayer);
  const base = previas[previas.length - 1] ?? datos.ibr[0];
  const d = deltaFrac * 100; // la serie IBR está en %
  const sintetica: TuplaIBR = [ayer, base[1] + d, base[2] + d, base[3] + d, base[4] + d, base[5] + d];
  const mover = (xs: [string, number][]): [string, number][] => xs.map(([f, v]) => [f, f >= fecha ? v + deltaFrac : v]);
  return {
    ...datos,
    ibr: [...previas, sintetica, ...datos.ibr.filter((r) => r[0] > ayer)],
    frac: mover(datos.frac),
    curvasFrac: datos.curvasFrac?.map((c) => (c.datos ? { ...c, datos: mover(c.datos) } : c)),
  };
}

export function escenarioPortafolio<P>(datos: DatosMercado, V: PosicionValorada<P>[], fecha: string, s: SupuestosEscenario) {
  const base = crearMotor(datos);
  const choque = V.some((x) => x.b.tipo === "IBR") ? crearMotor(mercadoConIBR(datos, fecha, (s.pb * s.ibr) / 1e4)) : base;

  const filas: FilaEscenario<P>[] = V.map((x) => {
    const { b, o } = x;
    const valor0 = o.giro;
    let valor1 = valor0,
      deltaPb = 0,
      supuesto = "";
    if (b.tipo === "TF" || b.tipo === "UVR") {
      deltaPb = deltaCurva(s, o.mac);
      const p0 = pvAt(o.flows, o.irr),
        p1 = pvAt(o.flows, o.irr + deltaPb / 1e4);
      valor1 = valor0 + ((p1 - p0) / 100) * b.nominal * o.fx;
      supuesto = b.tipo === "TF" ? "TIR + Δ curva TES a su duración" : "TIR real + Δ curva a su duración";
    } else if (b.tipo === "IPC") {
      deltaPb = deltaCurva(s, o.mac);
      const o1 = base.price({ ...b, spreadCompra: b.spreadCompra + deltaPb / 1e4 });
      if (!esError(o1)) valor1 = o1.giro;
      supuesto = "Spread real de negociación + Δ curva; IPC sin cambio";
    } else {
      deltaPb = s.pb * s.ibr;
      const o0 = base.price(b),
        o1 = choque.price(b);
      if (!esError(o0) && !esError(o1)) valor1 = valor0 + o1.giro - o0.giro;
      supuesto = b.precioDado ? "Precio dado: no cambia" : "IBR proyectado + Δ; cupones y descuento recalculados";
    }
    const delta = valor1 - valor0;
    return { p: x.p, tipo: b.tipo, deltaPb, supuesto, valor0, valor1, delta, deltaPct: valor0 ? delta / valor0 : 0 };
  });

  const valor0 = filas.reduce((a, f) => a + f.valor0, 0),
    valor1 = filas.reduce((a, f) => a + f.valor1, 0);
  return { filas, valor0, valor1, delta: valor1 - valor0, deltaPct: valor0 ? (valor1 - valor0) / valor0 : 0 };
}

export type ResultadoEscenario<P> = ReturnType<typeof escenarioPortafolio<P>>;
