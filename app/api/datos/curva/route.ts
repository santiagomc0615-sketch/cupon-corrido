/* Datos de una curva FRAC cargada (pública). El id cambia en cada carga, así que se puede cachear. */
import { leerCurvaFrac } from "@/lib/data/almacen";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{3,60}$/.test(id)) return Response.json({ error: "Id inválido." }, { status: 400 });
  const c = await leerCurvaFrac(id);
  if (!c) return Response.json({ error: "La curva no existe." }, { status: 404 });
  return Response.json(c, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
