/* Actualización manual de los datos de mercado, protegida con clave.
   POST con la cabecera "Authorization: Bearer <clave>", donde la clave es ACTUALIZAR_KEY
   (o ADMIN_KEY si ACTUALIZAR_KEY no está configurada). La clave nunca va en la URL. */
import { claveActualizarConfigurada, claveActualizarValida } from "@/lib/data/admin";
import { actualizarDatos } from "@/lib/data/actualizar";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!claveActualizarConfigurada()) {
    return Response.json({ error: "Falta configurar ACTUALIZAR_KEY (o ADMIN_KEY) en el servidor." }, { status: 503 });
  }
  if (!claveActualizarValida(req.headers.get("authorization"))) {
    return Response.json({ error: "Clave incorrecta." }, { status: 401 });
  }
  const r = await actualizarDatos();
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
