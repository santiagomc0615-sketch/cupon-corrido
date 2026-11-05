/* "Modo clase": explica cada resultado de la calculadora con su fórmula y los números del título,
   paso a paso, como en las hojas Calculadora_* del Excel. Solo reorganiza lo que ya calculó el
   motor (lib/engine); las pruebas verifican que cada explicación llega al mismo número. */
import { den, r3, toN, toS, type Bono, type FilaCronograma, type ResultadoValoracion } from "@/lib/engine";
import { F } from "@/lib/format";

export type ClaveClase = "dirty" | "accrued" | "clean" | "irr" | "mac" | "mod" | "dv01" | "conv" | "giro";

export interface Paso {
  etiqueta: string;
  /** Expresión con los números del título. */
  expresion?: string;
  valor: string;
}

export interface Explicacion {
  titulo: string;
  /** Fórmula general, en texto. */
  formula: string;
  nota?: string;
  pasos: Paso[];
  tabla?: { encabezados: string[]; filas: string[][]; total?: string[] };
  /** Valor numérico al que llega la explicación (para comprobar contra el motor). */
  resultado: number;
}

const n = (x: number, d = 4) => F.n(x, d);

/** Periodo vigente a la fecha de valoración (igual que el motor). */
function periodoVigente(o: ResultadoValoracion, val: number): FilaCronograma {
  const idx = Math.min(o.rows.length, o.rows.filter((r) => r.pay <= val).length + 1) - 1;
  return o.rows[Math.max(0, idx)];
}

/** Flujos pendientes descontados a la TIR: base de duración y convexidad. */
function tablaRiesgo(o: ResultadoValoracion) {
  let s = 0,
    st = 0,
    stt = 0;
  const filas = o.flows.map((f) => {
    const vp = f.cf / Math.pow(1 + o.irr, f.t);
    s += vp;
    st += f.t * vp;
    stt += f.t * (f.t + 1) * vp;
    return [toS(f.n), n(f.t), n(f.cf), n(vp), n(f.t * vp), n(f.t * (f.t + 1) * vp)];
  });
  return { filas, s, st, stt };
}

export function explicar(clave: ClaveClase, b: Bono, o: ResultadoValoracion): Explicacion {
  const val = toN(b.valoracion);
  const B = den(b.base);
  const fx = o.fx;
  const uvr = o.tipo === "UVR";
  const tasa = uvr ? "TIR real" : "TIR";

  switch (clave) {
    case "dirty": {
      const fut = o.rows.filter((r) => r.N > 0);
      const suma = fut.reduce((s, r) => s + r.vp, 0);
      const formula =
        o.tipo === "TF" || o.tipo === "UVR"
          ? `P sucio = TRUNC( Σ CFₜ / (1 + ${tasa})^(Nₜ/${B}) ; 3 )`
          : o.tipo === "IPC"
            ? "P sucio = TRUNC( Σ CFₜ × Rₜ ; 3 ),  Rₜ encadenado con q = (1 + IPC)(1 + spread de compra) − 1"
            : b.tipo === "IBR" && b.descuento === "TIR con IBR promedio"
              ? "P sucio = TRUNC( Σ CFₜ / (1 + TIR)^(días/365) ; 3 ),  TIR = (1 + (IBR prom. + spread)/p)^p − 1"
              : "P sucio = TRUNC( Σ CFₜ × Rₜ ; 3 ),  Rₜ encadenado con (1 + (IBR + spread)·D/base)";
      const nota =
        b.tipo === "IBR" && b.precioDado && b.precioDado > 0
          ? "Se usó el precio sucio dado en el formulario; la tabla muestra el precio teórico."
          : "Cada flujo es cupón + capital en % del nominal; Nₜ son los días que faltan para el pago según la base.";
      return {
        titulo: "Precio sucio",
        formula,
        nota,
        tabla: {
          encabezados: ["Pago", "Nₜ (días)", "t (años)", "CFₜ %", "VP %"],
          filas: fut.map((r) => [toS(r.pay), String(r.N), n(r.t), n(r.L), n(r.vp, 6)]),
          total: ["Σ VP", "", "", "", n(suma, 6)],
        },
        pasos: [
          { etiqueta: "Suma de valores presentes", valor: n(suma, 6) + " %" },
          { etiqueta: "Truncado a 3 decimales (TRUNC)", expresion: `TRUNC(${n(suma, 6)} ; 3)`, valor: F.n(o.dirty, 3) + " %" },
        ],
        resultado: o.dirty,
      };
    }

    case "accrued": {
      const cur = periodoVigente(o, val);
      const lineal = o.tipo === "IBR" || (b.tipo !== "IBR" && b.corrido === "Lineal");
      if (lineal)
        return {
          titulo: "Cupón corrido",
          formula: "CC = Cupón del periodo vigente × días corridos / días del periodo",
          nota: `Periodo vigente: ${toS(cur.start)} → ${toS(cur.pay)} (base ${b.base}).`,
          pasos: [
            { etiqueta: "Cupón del periodo", valor: n(cur.K) + " %" },
            { etiqueta: "Días corridos (inicio del periodo → valoración)", valor: String(o.diasCorridos) },
            { etiqueta: "Días del periodo", valor: String(o.diasPeriodo) },
            { etiqueta: "Cupón corrido", expresion: `${n(cur.K)} × ${o.diasCorridos} / ${o.diasPeriodo}`, valor: n(o.accrued) + " %" },
          ],
          resultado: o.accrued,
        };
      return {
        titulo: "Cupón corrido (compuesto)",
        formula: `CC = 100 × ((1 + tasa cupón)^(días corridos/${B}) − 1)`,
        nota: `Periodo vigente: ${toS(cur.start)} → ${toS(cur.pay)} (base ${b.base}).`,
        pasos: [
          { etiqueta: "Tasa cupón del periodo", valor: F.pct(cur.tasa, 4) },
          { etiqueta: "Días corridos", valor: String(o.diasCorridos) },
          {
            etiqueta: "Cupón corrido",
            expresion: `100 × ((1 + ${n(cur.tasa, 6)})^(${o.diasCorridos}/${B}) − 1)`,
            valor: n(o.accrued) + " %",
          },
        ],
        resultado: o.accrued,
      };
    }

    case "clean":
      return {
        titulo: "Precio limpio",
        formula: "P limpio = P sucio − cupón corrido",
        pasos: [
          { etiqueta: "Precio sucio", valor: F.n(o.dirty, 3) + " %" },
          { etiqueta: "Cupón corrido", valor: n(o.accrued) + " %" },
          { etiqueta: "Precio limpio", expresion: `${F.n(o.dirty, 3)} − ${n(o.accrued)}`, valor: F.n(o.clean, 3) + " %" },
          { etiqueta: "Condición", valor: o.cond },
        ],
        resultado: o.clean,
      };

    case "irr": {
      if (o.tipo === "TF" || o.tipo === "UVR")
        return {
          titulo: uvr ? "TIR real" : "TIR (E.A.)",
          formula: "La TIR es la tasa de negociación de compra que se escribe en el formulario.",
          nota: uvr ? `En pesos, con la UVR proyectada, la TIR es ${F.pct(o.tirPesos, 3)} (XIRR de los flujos en pesos).` : undefined,
          pasos: [
            { etiqueta: "Tasa de compra (E.A.)", valor: F.pct(o.irr, 3) },
            { etiqueta: "Tasa nominal equivalente (p pagos por año)", expresion: "p × ((1 + TIR)^(1/p) − 1)", valor: F.pct(o.nom, 3) },
          ],
          resultado: o.irr,
        };
      if (o.tipo === "IPC")
        return {
          titulo: "TIR (E.A.) de un título IPC",
          formula: "TIR: tasa que iguala Σ CFₜ/(1+TIR)^t con el precio sucio.  Tasa de negociación = (1 + IPC)(1 + spread) − 1",
          pasos: [
            { etiqueta: `IPC vigente (${o.ipcMes.slice(0, 7)})`, valor: F.pct(o.ipcVig, 3) },
            { etiqueta: "Spread de compra", valor: F.pct(b.tipo === "IPC" ? b.spreadCompra : 0, 3) },
            {
              etiqueta: "Tasa de negociación",
              expresion: `(1 + ${n(o.ipcVig, 6)}) × (1 + ${n(b.tipo === "IPC" ? b.spreadCompra : 0, 6)}) − 1`,
              valor: F.pct(o.tasaNeg, 3),
            },
            { etiqueta: "TIR que iguala el precio sucio (Newton-Raphson)", valor: F.pct(o.irr, 3) },
            { etiqueta: "TIR real", expresion: "(1 + TIR)/(1 + IPC) − 1", valor: F.pct(o.tirReal, 3) },
          ],
          resultado: o.irr,
        };
      // IBR
      const freq = b.frecuencia === "Mensual" ? 12 : b.frecuencia === "Bimestral" ? 6 : b.frecuencia === "Trimestral" ? 4 : b.frecuencia === "Semestral" ? 2 : 1;
      const spr = b.tipo === "IBR" ? b.spreadCompra : 0;
      return {
        titulo: "TIR (E.A.) de un título IBR",
        formula: "TIR = (1 + (IBR promedio + spread de compra) / p)^p − 1",
        nota:
          b.tipo === "IBR" && (b.descuento !== "TIR con IBR promedio" || (b.precioDado ?? 0) > 0)
            ? "Con descuento encadenado o precio dado, la TIR se obtiene además resolviendo Σ CFₜ/(1+TIR)^t = precio sucio."
            : undefined,
        pasos: [
          { etiqueta: "IBR promedio proyectado (N.A.)", valor: F.pct(o.ibrAvg, 3) },
          { etiqueta: "Spread de compra", valor: F.pct(spr, 3) },
          { etiqueta: "Pagos por año (p)", valor: String(freq) },
          {
            etiqueta: "TIR",
            expresion: `(1 + (${n(o.ibrAvg, 6)} + ${n(spr, 6)}) / ${freq})^${freq} − 1`,
            valor: F.pct(o.irr, 3),
          },
        ],
        resultado: o.irr,
      };
    }

    case "mac":
    case "mod": {
      const t = tablaRiesgo(o);
      const mac = t.st / t.s;
      const pasos: Paso[] = [
        { etiqueta: "Σ VP", valor: n(t.s, 6) },
        { etiqueta: "Σ t × VP", valor: n(t.st, 6) },
        { etiqueta: "Duración Macaulay (años)", expresion: `${n(t.st, 6)} / ${n(t.s, 6)}`, valor: n(mac) },
      ];
      if (clave === "mod")
        pasos.push({
          etiqueta: "Duración modificada",
          expresion: `ROUND(${n(mac)} ; 3) / (1 + ${n(o.irr, 6)})`,
          valor: n(o.mod),
        });
      return {
        titulo: clave === "mac" ? "Duración de Macaulay" : "Duración modificada",
        formula:
          clave === "mac"
            ? `Macaulay = Σ t × VPₜ / Σ VPₜ,  con VPₜ = CFₜ/(1 + ${tasa})^t`
            : `D* = ROUND(Macaulay ; 3) / (1 + ${tasa})`,
        tabla: { encabezados: ["Pago", "t", "CFₜ %", "VPₜ", "t × VPₜ", "t(t+1) × VPₜ"], filas: t.filas },
        pasos,
        resultado: clave === "mac" ? o.mac : o.mod,
      };
    }

    case "dv01":
      return {
        titulo: "DV01 (valor de un punto básico)",
        formula: uvr
          ? "DV01 = ROUND(D* ; 3) × P sucio/100 × nominal × 0,0001 × UVR"
          : "DV01 = ROUND(D* ; 3) × P sucio/100 × nominal × 0,0001",
        nota: "Cuánto cambia el valor de la posición, en pesos, si la tasa sube o baja 1 pb (0,01 %).",
        pasos: [
          { etiqueta: "Duración modificada redondeada", valor: F.n(r3(o.mod), 3) },
          { etiqueta: "Precio sucio", valor: F.n(o.dirty, 3) + " %" },
          { etiqueta: "Nominal", valor: F.n(b.nominal, 0) + (uvr ? " UVR" : "") },
          ...(uvr ? [{ etiqueta: "UVR a la valoración", valor: F.n(fx, 4) }] : []),
          {
            etiqueta: "DV01",
            expresion: `${F.n(r3(o.mod), 3)} × ${F.n(o.dirty, 3)}/100 × ${F.n(b.nominal, 0)} × 0,0001${uvr ? " × " + F.n(fx, 4) : ""}`,
            valor: F.cop(o.dv01),
          },
        ],
        resultado: o.dv01,
      };

    case "conv": {
      const t = tablaRiesgo(o);
      return {
        titulo: "Convexidad",
        formula: `C = Σ t(t+1) × VPₜ / ( Σ VPₜ × (1 + ${tasa})² )`,
        nota: "Corrige la aproximación por duración: ΔP/P ≈ −D*·Δy + ½·C·Δy².",
        tabla: { encabezados: ["Pago", "t", "CFₜ %", "VPₜ", "t × VPₜ", "t(t+1) × VPₜ"], filas: t.filas },
        pasos: [
          { etiqueta: "Σ t(t+1) × VP", valor: n(t.stt, 6) },
          { etiqueta: "Σ VP × (1 + TIR)²", expresion: `${n(t.s, 6)} × (1 + ${n(o.irr, 6)})²`, valor: n(t.s * Math.pow(1 + o.irr, 2), 6) },
          { etiqueta: "Convexidad", valor: F.n(o.conv, 4) },
        ],
        resultado: o.conv,
      };
    }

    case "giro":
      return {
        titulo: "Valor de giro",
        formula: uvr ? "Giro = P sucio/100 × nominal (UVR) × UVR" : "Giro = P sucio/100 × nominal",
        pasos: [
          { etiqueta: "Precio sucio", valor: F.n(o.dirty, 3) + " %" },
          { etiqueta: "Nominal", valor: F.n(b.nominal, 0) + (uvr ? " UVR" : "") },
          ...(uvr ? [{ etiqueta: "UVR", valor: F.n(fx, 4) }] : []),
          {
            etiqueta: "Valor de giro",
            expresion: `${F.n(o.dirty, 3)}/100 × ${F.n(b.nominal, 0)}${uvr ? " × " + F.n(fx, 4) : ""}`,
            valor: F.cop(o.giro),
          },
        ],
        resultado: o.giro,
      };
  }
}
