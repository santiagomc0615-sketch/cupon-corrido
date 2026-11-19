/* Modo clase de «Buscar objetivo»: fórmulas del cupón y del precio, la ecuación que se resolvió con
   la sustitución numérica y el método (Brent, tolerancia 1e-8). Solo texto: las cifras son las del motor. */
import type { TipoBono } from "@/lib/engine";
import { nf } from "@/lib/format";
import { fmtValor, RESULTADOS, VARIABLES, type Problema, type Respuesta } from "./objetivo";
import { TOLERANCIA } from "./solver";

export interface PasoAPaso {
  formulas: [string, string][];
  ecuacion: string;
  sustitucion: string;
  metodo: string;
  notas: string[];
}

const SIMBOLO: Record<string, string> = { spreadFacial: "s", spreadCompra: "s_c", tasaCompra: "r", tasaCupon: "c", precioCompra: "P", nominal: "N" };

function formulaCupon(t: TipoBono): [string, string][] {
  switch (t) {
    case "TF":
      return [["Cupón del periodo j", "Cupón_j = 100 × ((1 + c)^(días_j / base) − 1), con c el cupón E.A."]];
    case "UVR":
      return [
        ["Cupón del periodo j (en UVR)", "Cupón_j = 100 × ((1 + c)^(días_j / base) − 1), con c el cupón real"],
        ["Flujo en pesos", "Flujo_j × UVR proyectada al pago (con la inflación elegida)"],
      ];
    case "IBR":
      return [
        ["Cupón del periodo j", "Cupón_j = 100 × (IBR_j + s) × días_j / base"],
        ["IBR_j", "FRA del inicio del periodo (Curva FRAC); el periodo en curso, IBR publicado del día hábil anterior"],
      ];
    case "IPC":
      return [
        ["Tasa del periodo j", "Tasa_j = (1 + IPC_j)(1 + s) − 1"],
        ["Cupón del periodo j", "Cupón_j = 100 × ((1 + Tasa_j)^(días_j / base) − 1)"],
        ["IPC_j", "IPC al inicio o al final del periodo según la modalidad (vigente o proyectado con expectativas)"],
      ];
  }
}

export function pasoAPaso(p: Problema, r: Respuesta): PasoAPaso {
  const t = p.entradas.tipo as TipoBono;
  const R = RESULTADOS[p.resultado],
    V = VARIABLES[p.variable];
  const sim = SIMBOLO[p.variable];
  const xirr = p.resultado === "tirXirr";
  const tiempo = xirr ? "t_j = días reales desde la compra / 365" : "t_j = días desde la compra según la base / (360 o 365)";
  const precio = r.flujos.reduce((s, f) => s + f.vp, 0);
  const y = p.resultado === "tir" || p.resultado === "tirXirr" ? r.eval.valor / 100 : null;

  const formulas: [string, string][] = [
    ...formulaCupon(t),
    ["Flujo del periodo j", "Flujo_j = Cupón_j + amortización (100 en el último pago)"],
    ["Precio sucio", `P = Σ Flujo_j / (1 + TIR)^t_j, con ${tiempo}`],
    ["Precio limpio", "Precio sucio − cupón corrido"],
    ["Valor de giro", t === "UVR" ? "Precio sucio / 100 × nominal × UVR" : "Precio sucio / 100 × nominal"],
  ];

  const muestra = r.flujos.length > 4 ? [...r.flujos.slice(0, 2), null, ...r.flujos.slice(-1)] : r.flujos;
  const tasa = y != null ? nf(6).format(1 + y) : "(1 + TIR)";
  const terminos = muestra.map((f) => (f ? `${nf(4).format(f.flujo)} / ${tasa}^${nf(4).format(f.t)}` : "…")).join(" + ");
  const sustitucion = `${nf(3).format(precio)} = ${terminos}`;

  const ecuacion = `f(${sim}) = ${R.nombre}(${sim}) − ${fmtValor(p.objetivo, R.unidad)} = 0  →  ${sim} = ${fmtValor(r.x, V.unidad, 6)}`;
  const metodo = `Método de Brent (bisección + secante + interpolación cuadrática inversa) sobre el intervalo con cambio de signo más cercano al valor actual; tolerancia ${TOLERANCIA.toExponential(0).replace("e", "×10^")}; ${r.raiz.iteraciones} iteraciones. Cada iteración vuelve a valorar el título con el motor.`;
  const notas = [
    "El precio sucio se trunca a 3 decimales (como el Excel): la TIR alcanzable va en escalones muy pequeños, por eso la verificación puede diferir en la cuarta cifra.",
    ...(p.aLaPar ? ["A la par: emisión = fecha de valoración y precio de compra 100."] : []),
    ...(p.primerPeriodoFRA ? ["El periodo que empieza el día de la compra se proyecta con la FRA de esa fecha (se valora un día antes con los mismos flujos)."] : []),
  ];
  return { formulas, ecuacion, sustitucion, metodo, notas };
}
