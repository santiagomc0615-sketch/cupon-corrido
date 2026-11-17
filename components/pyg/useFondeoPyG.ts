"use client";
/* Fondeo configurado en el panel «Carry y fondeo», para ofrecerlo en el P&G (apagado por defecto).
   Usa exactamente lib/carry: monto fondeado = giro × (1 − haircut) y la tasa E.A. del panel. */
import { useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { fondeoConfigurado } from "@/components/reporte/BotonReporte";
import { tasaEfectiva } from "@/lib/carry/config";
import { montos, NOMBRE_FONDEO } from "@/lib/carry/fondeo";
import type { FondeoPyG } from "@/lib/pyg/fondeo";

const pct = (x: number, d = 2) => (x * 100).toFixed(d).replace(".", ",") + " %";

/** null si el usuario no fondea (capital propio) o falta la tasa. */
export function useFondeoPyG(giro: number): FondeoPyG | null {
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  if (!fondeoConfigurado() || c.tipo === "propio") return null;
  const t = tasaEfectiva(c, m);
  if (t == null || !(giro > 0)) return null;
  return {
    fondeado: montos(giro, c).fondeado,
    tasaEA: t,
    descripcion: `${NOMBRE_FONDEO[c.tipo].toLowerCase()} ${pct(t)}, haircut ${pct(c.haircut, 0)}`,
  };
}
