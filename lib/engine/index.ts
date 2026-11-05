/* Motor de valoración de renta fija colombiana — réplica de las fórmulas de
   excel/Calculadora_para_pagina.xlsx (validado con validacion/casos-prueba.json).
   Funciones puras: los datos de mercado se pasan explícitamente. */
import { validate } from "./cronograma";
import { holding } from "./holding";
import { priceIBR } from "./ibr";
import { priceIPC } from "./ipc";
import {
  expect,
  frac,
  ibrPub,
  ipcVigente,
  prepararMercado,
  spot,
  uvrAt,
  type DatosMercado,
  type Mercado,
} from "./mercado";
import { priceTF } from "./tf";
import type { Bono, ResultadoValoracion, Valoracion } from "./types";
import { priceUVR } from "./uvr";

/** Valora un título. Devuelve { error } si las entradas no permiten valorarlo. */
export function price(M: Mercado, b: Bono): Valoracion {
  const err = validate(b);
  if (err && !err.startsWith("⚠ Valoración")) return { error: err };
  try {
    let o: ResultadoValoracion;
    switch (b.tipo) {
      case "TF":
        o = priceTF(M, b);
        break;
      case "IPC":
        o = priceIPC(M, b);
        break;
      case "UVR":
        o = priceUVR(M, b);
        break;
      case "IBR":
        o = priceIBR(M, b);
        break;
    }
    o.aviso = err;
    return o;
  } catch (e) {
    return { error: "No se pudo valorar: " + (e instanceof Error ? e.message : String(e)) };
  }
}

/** Motor con los datos de mercado ya cargados (equivalente a `BondEngine` del prototipo). */
export function crearMotor(datos: DatosMercado) {
  const M = prepararMercado(datos);
  return {
    mercado: M,
    price: (b: Bono) => price(M, b),
    holding,
    spot: (t: number) => spot(M, t),
    ipcVigente: (n: number) => ipcVigente(M, n),
    uvrAt: (n: number) => uvrAt(M, n),
    ibrPub: (n: number, col: number) => ibrPub(M, n, col),
    expect: (n: number) => expect(M, n),
    frac: (n: number) => frac(M, n),
  };
}
export type Motor = ReturnType<typeof crearMotor>;

export { holding } from "./holding";
export { pfMetrics, type PosicionValorada, type MetricasPortafolio } from "./portafolio";
export { priceTF } from "./tf";
export { priceIPC } from "./ipc";
export { priceUVR } from "./uvr";
export { priceIBR } from "./ibr";
export { baseSchedule, validate, condicion, FREQ } from "./cronograma";
export { pvAt, solveYield, xirr, riskFrom, sensitivity, trunc3, r3 } from "./finanzas";
export { toN, toS, edate, days, den, addBizDays } from "./fechas";
export * from "./mercado";
export * from "./types";
