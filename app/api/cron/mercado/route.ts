/* Refresco programado de los datos de mercado (Vercel Cron, ver vercel.json: 12:00 y 21:00 de Bogotá).
   Vercel envía "Authorization: Bearer <CRON_SECRET>". Lee el IPC del DANE (en los días de
   publicación reintenta si el mes esperado aún no aparece), guarda la última lectura buena y vence
   la caché de las fuentes en vivo. */
import { actualizarDatos } from "@/lib/data/actualizar";

// Hasta 3 intentos con 15 s de pausa en los días de publicación del DANE.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const r = await actualizarDatos({ reintentos: 2 });
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
