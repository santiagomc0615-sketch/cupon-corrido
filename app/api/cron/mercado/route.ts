/* Refresco diario de los datos de mercado (Vercel Cron, ver vercel.json).
   Vercel envía "Authorization: Bearer <CRON_SECRET>". Marca la caché como vencida y la siguiente
   visita la regenera en segundo plano (stale-while-revalidate). */
import { revalidateTag } from "next/cache";
import { TAG_VIVO } from "@/lib/data/mercado";

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  revalidateTag(TAG_VIVO, "max");
  return Response.json({ ok: true, revalidado: TAG_VIVO, hora: new Date().toISOString() });
}
