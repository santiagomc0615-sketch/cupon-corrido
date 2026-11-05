/* Validación de una carga antes de guardarla (se usa en el cliente para la vista previa
   y en el servidor antes de escribir). */
import { toN, toS } from "@/lib/engine";
import type { Carga, TipoSerieCargada } from "./tipos";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fechaOk = (f: unknown): f is string => typeof f === "string" && ISO.test(f) && toS(toN(f)) === f;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Rango razonable de cada serie (para detectar unidades equivocadas). */
const RANGO: Record<TipoSerieCargada | "frac", [number, number, string]> = {
  frac: [-0.05, 0.6, "IBR forward en fracción (0,1126 = 11,26 %)"],
  exp: [-0.05, 0.6, "inflación esperada en fracción (0,053 = 5,3 %)"],
  ibr12: [0, 0.6, "IBR 12 meses en fracción (0,1228 = 12,28 %)"],
  ipc: [1, 1000, "índice IPC (base dic-2018 = 100)"],
};

export const MAX_FILAS = 40_000;

/** Lista de problemas que impiden guardar (vacía si todo está bien). */
export function validarCarga(c: Carga): string[] {
  const e: string[] = [];
  if (!c.origen?.trim()) e.push("Falta el origen (archivo u hoja).");
  if (c.tipo === "tes") {
    if (!fechaOk(c.fecha)) e.push("La fecha de la curva TES no es válida.");
    if (c.refs.length < 2) e.push("Se necesitan al menos 2 referencias TES.");
    if (c.refs.length > 60) e.push("Demasiadas referencias TES (máximo 60).");
    c.refs.forEach(([t, v, cup, tir], i) => {
      if (!t || !fechaOk(v)) e.push(`Referencia ${i + 1}: vencimiento inválido.`);
      else if (v <= c.fecha) e.push(`Referencia ${i + 1} (${t}): vence antes de la fecha de la curva.`);
      if (!num(cup) || cup < 0 || cup > 0.5) e.push(`Referencia ${i + 1}: cupón fuera de rango (use fracción).`);
      if (!num(tir) || tir < -0.05 || tir > 0.6) e.push(`Referencia ${i + 1}: TIR fuera de rango (use fracción).`);
    });
    return e.slice(0, 12);
  }
  const datos = c.datos;
  const [min, max, unidad] = RANGO[c.tipo];
  if (datos.length < 2) e.push("La serie tiene menos de 2 filas.");
  if (datos.length > MAX_FILAS) e.push(`La serie tiene más de ${MAX_FILAS.toLocaleString("es-CO")} filas.`);
  let previa = "";
  for (let i = 0; i < datos.length && e.length < 12; i++) {
    const [f, v] = datos[i];
    if (!fechaOk(f)) e.push(`Fila ${i + 1}: fecha inválida.`);
    else if (f <= previa) e.push(`Fila ${i + 1}: las fechas deben ir en orden ascendente y sin repetirse (${f}).`);
    else previa = f;
    if (!num(v)) e.push(`Fila ${i + 1}: valor no numérico.`);
    else if (v < min || v > max) e.push(`Fila ${i + 1}: ${v} está fuera de rango; se espera ${unidad}.`);
  }
  if (c.tipo === "frac") {
    if (!c.id || !/^[a-z0-9-]{3,60}$/.test(c.id)) e.push("Id de curva inválido.");
    if (!c.nombre?.trim()) e.push("La curva necesita un nombre.");
    if (datos.length && c.fechaBase !== datos[0][0]) e.push("La fecha base debe ser la primera fecha de la curva.");
  }
  return e;
}
