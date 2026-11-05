/* Almacenamiento de las series cargadas por el administrador.
   - En Vercel (con BLOB_READ_WRITE_TOKEN): Vercel Blob privado, carpeta cargas/.
   - En local: archivos JSON en data/cargas/ (ignorado por git).
   Solo se usa desde el servidor. */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import {
  INDICE_VACIO,
  type Carga,
  type CargaFRAC,
  type CargaSerie,
  type CargaTES,
  type CargasServidor,
  type IndiceCargas,
  type TipoEliminable,
  type TipoSerieCargada,
} from "@/lib/cargas/tipos";

interface Almacen {
  leer(nombre: string): Promise<string | null>;
  escribir(nombre: string, texto: string): Promise<void>;
  borrar(nombre: string): Promise<void>;
}

/** Carpeta local (CARGAS_DIR permite otra, p. ej. en las pruebas). */
// turbopackIgnore: la carpeta solo se usa en tiempo de ejecución; evita que el build rastree todo el proyecto.
const carpetaLocal = () => process.env.CARGAS_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "cargas");

const almacenLocal: Almacen = {
  async leer(nombre) {
    try {
      return await fs.readFile(path.join(carpetaLocal(), nombre), "utf8");
    } catch {
      return null;
    }
  },
  async escribir(nombre, texto) {
    await fs.mkdir(carpetaLocal(), { recursive: true });
    await fs.writeFile(path.join(carpetaLocal(), nombre), texto, "utf8");
  },
  async borrar(nombre) {
    await fs.rm(path.join(carpetaLocal(), nombre), { force: true });
  },
};

const almacenBlob: Almacen = {
  async leer(nombre) {
    const r = await get(`cargas/${nombre}`, { access: "private", useCache: false });
    if (!r) return null;
    return await new Response(r.stream).text();
  },
  async escribir(nombre, texto) {
    await put(`cargas/${nombre}`, texto, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  },
  async borrar(nombre) {
    await del(`cargas/${nombre}`);
  },
};

const almacen = (): Almacen => (process.env.BLOB_READ_WRITE_TOKEN ? almacenBlob : almacenLocal);

/** En Vercel sin Blob configurado no se puede escribir en disco. */
export function puedeGuardar(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) || !process.env.VERCEL;
}

async function leerJSON<T>(nombre: string): Promise<T | null> {
  const t = await almacen().leer(nombre);
  return t ? (JSON.parse(t) as T) : null;
}

const archivoFrac = (id: string) => `frac-${id.replace(/[^a-z0-9-]/gi, "")}.json`;

export async function leerIndice(): Promise<IndiceCargas> {
  return (await leerJSON<IndiceCargas>("indice.json")) ?? INDICE_VACIO;
}

/** Índice + series pequeñas (sin curvas FRAC). */
export async function leerCargas(): Promise<CargasServidor> {
  const indice = await leerIndice();
  const series: CargasServidor["series"] = {};
  for (const t of Object.keys(indice.series) as TipoSerieCargada[]) {
    const s = await leerJSON<CargaSerie>(`${t}.json`);
    if (s) series[t] = s;
  }
  const tes = indice.tes ? ((await leerJSON<CargaTES>("tes.json")) ?? undefined) : undefined;
  const tesuvr = indice.tesuvr ? ((await leerJSON<CargaTES>("tesuvr.json")) ?? undefined) : undefined;
  return { indice, series, tes, tesuvr };
}

export async function leerCurvaFrac(id: string): Promise<CargaFRAC | null> {
  return leerJSON<CargaFRAC>(archivoFrac(id));
}

const meta = (origen: string, cargada: string, datos: [string, unknown][]) => ({
  origen,
  cargada,
  filas: datos.length,
  desde: datos[0]?.[0] ?? "",
  hasta: datos[datos.length - 1]?.[0] ?? "",
});

export async function guardarCarga(c: Carga): Promise<IndiceCargas> {
  const a = almacen();
  const indice = await leerIndice();
  if (c.tipo === "frac") {
    await a.escribir(archivoFrac(c.id), JSON.stringify(c));
    const { datos: _datos, tipo: _tipo, ...m } = c;
    void _datos;
    void _tipo;
    indice.frac = [...indice.frac.filter((x) => x.id !== c.id), m].sort((x, y) => (x.fechaBase < y.fechaBase ? 1 : -1));
  } else if ("refs" in c) {
    await a.escribir(`${c.tipo}.json`, JSON.stringify(c));
    const filas = c.refs.map((r) => [r[1], 0] as [string, unknown]).sort();
    indice[c.tipo] = { ...meta(c.origen, c.cargada, filas), fecha: c.fecha };
  } else {
    await a.escribir(`${c.tipo}.json`, JSON.stringify(c));
    indice.series = { ...indice.series, [c.tipo]: meta(c.origen, c.cargada, c.datos) };
  }
  await a.escribir("indice.json", JSON.stringify(indice));
  return indice;
}

export async function eliminarCarga(tipo: TipoEliminable, id?: string): Promise<IndiceCargas> {
  const a = almacen();
  const indice = await leerIndice();
  if (tipo === "frac") {
    if (!id) throw new Error("Falta el id de la curva");
    await a.borrar(archivoFrac(id));
    indice.frac = indice.frac.filter((x) => x.id !== id);
  } else if (tipo === "tes" || tipo === "tesuvr") {
    await a.borrar(`${tipo}.json`);
    delete indice[tipo];
  } else {
    await a.borrar(`${tipo}.json`);
    const { [tipo]: _quitar, ...resto } = indice.series;
    void _quitar;
    indice.series = resto;
  }
  await a.escribir("indice.json", JSON.stringify(indice));
  return indice;
}

export async function renombrarCurva(id: string, nombre: string): Promise<IndiceCargas> {
  const a = almacen();
  const indice = await leerIndice();
  const c = await leerCurvaFrac(id);
  if (!c) throw new Error("La curva no existe");
  await a.escribir(archivoFrac(id), JSON.stringify({ ...c, nombre }));
  indice.frac = indice.frac.map((x) => (x.id === id ? { ...x, nombre } : x));
  await a.escribir("indice.json", JSON.stringify(indice));
  return indice;
}
