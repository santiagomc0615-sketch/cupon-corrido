/* Cargas del administrador: guardar, eliminar y renombrar series (FRAC, IPC, expectativas, IBR 12M, TES).
   Requiere la cabecera x-admin-key = ADMIN_KEY. Cada cambio invalida la caché de datos de mercado. */
import { revalidateTag } from "next/cache";
import { claveConfigurada, claveValida } from "@/lib/data/admin";
import { eliminarCarga, guardarCarga, puedeGuardar, renombrarCurva } from "@/lib/data/almacen";
import { TAG_CARGAS } from "@/lib/data/mercado";
import type { Carga, TipoEliminable } from "@/lib/cargas/tipos";
import { validarCarga } from "@/lib/cargas/validar";

type Accion =
  | { accion: "guardar"; carga: Carga }
  | { accion: "eliminar"; tipo: TipoEliminable; id?: string }
  | { accion: "renombrar"; id: string; nombre: string };

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status });

/** Estado de la configuración (sin revelar la clave). */
export async function GET() {
  return json({ claveConfigurada: claveConfigurada(), puedeGuardar: puedeGuardar() });
}

export async function POST(req: Request) {
  if (!claveConfigurada()) return json({ error: "La carga está desactivada: falta configurar ADMIN_KEY en el servidor." }, 503);
  if (!claveValida(req.headers.get("x-admin-key"))) return json({ error: "Clave de administrador incorrecta." }, 401);
  if (!puedeGuardar()) return json({ error: "Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN) para guardar en producción." }, 503);

  let a: Accion;
  try {
    a = (await req.json()) as Accion;
  } catch {
    return json({ error: "El cuerpo no es JSON válido." }, 400);
  }

  try {
    let indice;
    if (a.accion === "guardar") {
      const problemas = validarCarga(a.carga);
      if (problemas.length) return json({ error: "La carga tiene errores.", problemas }, 422);
      indice = await guardarCarga({ ...a.carga, cargada: new Date().toISOString() });
    } else if (a.accion === "eliminar") {
      indice = await eliminarCarga(a.tipo, a.id);
    } else if (a.accion === "renombrar") {
      const nombre = String(a.nombre ?? "").trim().slice(0, 80);
      if (!nombre) return json({ error: "El nombre no puede quedar vacío." }, 422);
      indice = await renombrarCurva(a.id, nombre);
    } else {
      return json({ error: "Acción desconocida." }, 400);
    }
    revalidateTag(TAG_CARGAS, { expire: 0 });
    return json({ ok: true, indice });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "No se pudo guardar." }, 500);
  }
}
