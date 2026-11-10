/* Combina las tres fuentes de cada serie, en este orden de prioridad:
   1. en vivo (BanRep SDMX; IPC del DANE), 2. cargada por el administrador, 3. respaldo del Excel del curso.
   Función pura: se prueba sin red. */
import { curvaCero, plazoTES, type DatosMercado, type TuplaFecha, type TuplaIBR, type TuplaIPC, type TuplaTES } from "@/lib/engine";
import type { CargasServidor } from "@/lib/cargas/tipos";

export type EstadoFuente = "en-vivo" | "cargado" | "respaldo";

export interface InfoFuente {
  /** Quién publica el dato. */
  fuente: string;
  estado: EstadoFuente;
  /** Fecha del último dato. */
  hasta: string;
  /** Explicación corta (p. ej. por qué se usa el respaldo). */
  detalle?: string;
  /** Fecha y hora (Bogotá) de la última consulta exitosa a la fuente en vivo. */
  consultado?: string;
}

export type ClaveFuente = "tpm" | "ibr" | "ibr12" | "uvr" | "ipc" | "exp" | "tes" | "tesuvr" | "frac" | "trm";

export interface IpcEnVivo {
  /** [fin de mes, índice base dic-2018, —, fecha de publicación] */
  serie: [string, number, null, string | null][];
  /** Fecha de publicación del último mes según el anexo del DANE. */
  publicado: string | null;
  /** Fecha y hora (Bogotá) de la consulta exitosa. */
  consultado: string;
  /** true: el DANE no respondió ahora y se usa la última lectura guardada. */
  guardado?: boolean;
}

export interface DatosEnVivo {
  tpm?: [string, number][];
  ibr?: [string, number, number, number, number][];
  uvr?: [string, number][];
  ipc?: IpcEnVivo;
  errores: Partial<Record<"tpm" | "ibr" | "uvr" | "trm" | "ipc", string>>;
}

const ultimo = <T extends [string, ...unknown[]]>(a: T[]) => a[a.length - 1]?.[0] ?? "";
const porFecha = <T extends [string, ...unknown[]]>(a: T[]) => a.slice().sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));

/** Reemplaza el tramo desde la primera fecha de `nuevo` y conserva lo anterior de `base`. */
function empalmar<T extends [string, ...unknown[]]>(base: T[], nuevo: T[]): T[] {
  if (!nuevo.length) return base;
  const desde = nuevo[0][0];
  return [...base.filter((r) => r[0] < desde), ...nuevo];
}

/** Sobrescribe por fecha (mismo mes para series mensuales con `clave`). */
function fusionar<T extends [string, ...unknown[]]>(base: T[], extra: T[], clave = (f: string) => f): T[] {
  const m = new Map(base.map((r) => [clave(r[0]), r]));
  for (const r of extra) m.set(clave(r[0]), r);
  return porFecha([...m.values()]);
}

export function combinar(respaldo: DatosMercado, vivo: DatosEnVivo, cargas: CargasServidor) {
  const fuentes: Partial<Record<ClaveFuente, InfoFuente>> = {};
  const cargaIbr12 = cargas.series.ibr12;

  /* ---- IBR: ON a 6M en vivo; 12M del Excel o cargado (BanRep SDMX no lo publica) ---- */
  const ibr12 = new Map<string, number>(respaldo.ibr.map((r) => [r[0], r[5]]));
  cargaIbr12?.datos.forEach(([f, v]) => ibr12.set(f, v * 100));
  const fechas12 = [...ibr12.keys()].sort();
  const ibr12Hasta = fechas12[fechas12.length - 1] ?? "";
  let ibr: TuplaIBR[] = respaldo.ibr;
  if (vivo.ibr?.length) {
    let ult12 = NaN;
    const vivas: TuplaIBR[] = vivo.ibr.map(([f, on, m1, m3, m6]) => {
      const v12 = ibr12.get(f);
      if (v12 != null) ult12 = v12;
      else if (Number.isNaN(ult12)) ult12 = ibr12.get(fechas12.filter((x) => x <= f).pop() ?? "") ?? m6;
      return [f, on, m1, m3, m6, ult12];
    });
    ibr = empalmar(respaldo.ibr, vivas);
    fuentes.ibr = { fuente: "BanRep · SDMX", estado: "en-vivo", hasta: ultimo(ibr) };
  } else {
    fuentes.ibr = { fuente: "Excel del curso", estado: "respaldo", hasta: ultimo(ibr), detalle: vivo.errores.ibr };
  }
  fuentes.ibr12 = cargaIbr12
    ? { fuente: "Cargado · " + cargaIbr12.origen, estado: "cargado", hasta: ibr12Hasta }
    : { fuente: "Excel del curso", estado: "respaldo", hasta: ibr12Hasta, detalle: "BanRep SDMX no publica el IBR a 12 meses" };

  /* ---- UVR ---- */
  let uvr: TuplaFecha[] = respaldo.uvr;
  if (vivo.uvr?.length) {
    uvr = empalmar(respaldo.uvr, vivo.uvr);
    fuentes.uvr = { fuente: "BanRep · SDMX", estado: "en-vivo", hasta: ultimo(uvr) };
  } else fuentes.uvr = { fuente: "Excel del curso", estado: "respaldo", hasta: ultimo(uvr), detalle: vivo.errores.uvr };

  /* ---- IPC (índice mensual, fin de mes): DANE en vivo > cargado > Excel, mes por mes ---- */
  const mes = (f: string) => f.slice(0, 7);
  let ipc: TuplaIPC[] = respaldo.ipc;
  const cargaIpc = cargas.series.ipc;
  if (cargaIpc?.datos.length) {
    ipc = fusionar<TuplaIPC>(respaldo.ipc, cargaIpc.datos.map(([f, v]) => [f, v]), mes);
    fuentes.ipc = { fuente: "DANE · cargado (" + cargaIpc.origen + ")", estado: "cargado", hasta: ultimo(ipc) };
  } else fuentes.ipc = { fuente: "DANE · Excel del curso", estado: "respaldo", hasta: ultimo(ipc) };
  if (vivo.ipc?.serie.length) {
    ipc = fusionar<TuplaIPC>(ipc, vivo.ipc.serie, mes);
    fuentes.ipc = vivo.ipc.guardado
      ? {
          fuente: "DANE · última lectura guardada",
          estado: "respaldo",
          hasta: ultimo(ipc),
          consultado: vivo.ipc.consultado,
          detalle: vivo.errores.ipc,
        }
      : { fuente: "DANE · anexo IPC", estado: "en-vivo", hasta: ultimo(ipc), consultado: vivo.ipc.consultado };
  } else if (vivo.errores.ipc) fuentes.ipc = { ...fuentes.ipc, detalle: vivo.errores.ipc };

  /* ---- Expectativas de inflación ---- */
  const cargaExp = cargas.series.exp;
  const exp: TuplaFecha[] = cargaExp?.datos.length ? porFecha(cargaExp.datos) : respaldo.exp;
  fuentes.exp = cargaExp?.datos.length
    ? { fuente: "Cargado · " + cargaExp.origen, estado: "cargado", hasta: exp[0][0] }
    : { fuente: "Encuesta BanRep · Excel del curso", estado: "respaldo", hasta: exp[0][0] };

  /* ---- Curva TES ---- */
  let curveDate = respaldo.curveDate,
    tes: TuplaTES[] = respaldo.tes,
    zero = respaldo.zero;
  if (cargas.tes?.refs.length) {
    curveDate = cargas.tes.fecha;
    tes = cargas.tes.refs.map(([t, venc, cup, tir]): TuplaTES => [t, venc, cup, tir, plazoTES(curveDate, venc)]).sort((a, b) => a[4] - b[4]);
    zero = curvaCero(tes);
    fuentes.tes = { fuente: "Cargado · " + cargas.tes.origen, estado: "cargado", hasta: curveDate };
  } else fuentes.tes = { fuente: "SEN / proveedor de precios · Excel del curso", estado: "respaldo", hasta: curveDate };

  /* ---- Curva TES UVR (real): solo si se cargó; sirve para la inflación implícita ---- */
  let curvaUVR: DatosMercado["curvaUVR"];
  if (cargas.tesuvr?.refs.length) {
    const f = cargas.tesuvr.fecha;
    const tesU = cargas.tesuvr.refs.map(([t, venc, cup, tir]): TuplaTES => [t, venc, cup, tir, plazoTES(f, venc)]).sort((a, b) => a[4] - b[4]);
    curvaUVR = { fecha: f, tes: tesU, zero: curvaCero(tesU) };
    fuentes.tesuvr = { fuente: "Cargado · " + cargas.tesuvr.origen, estado: "cargado", hasta: f };
  }

  /* ---- Curvas FRAC: la del Excel siempre; las cargadas solo con su información ---- */
  fuentes.frac = cargas.indice.frac.length
    ? { fuente: `${cargas.indice.frac.length + 1} curvas (Excel + cargadas)`, estado: "cargado", hasta: cargas.indice.frac[0].fechaBase }
    : { fuente: "Excel del curso", estado: "respaldo", hasta: respaldo.frac[0][0] };

  const datos: DatosMercado = { ...respaldo, ibr, uvr, ipc, exp, curveDate, tes, zero, curvasFrac: cargas.indice.frac, curvaUVR };
  return { datos, fuentes };
}
