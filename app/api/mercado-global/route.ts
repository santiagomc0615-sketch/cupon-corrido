/* GET /api/mercado-global — datos globales del día (TRM, UST 10A, SOFR y spread TES 10A − UST 10A),
   cada uno con fuente y fecha. Sale del mismo conjunto en caché que la página (obtenerMercado), que el
   cron renueva a las 12:00 y 21:00 de Bogotá: esta ruta no consulta las fuentes en cada llamada. */
import { obtenerMercado } from "@/lib/data/mercado";
import { derivarMercado } from "@/lib/mercado-derivado";
import { crearMotor } from "@/lib/engine";
import { spreadTesUst } from "@/lib/global";

export async function GET() {
  const snap = await obtenerMercado();
  const tes10 = derivarMercado(crearMotor(snap.datos), snap).tes10;
  const spread = snap.ust10Curva
    ? spreadTesUst({ nombre: tes10[0], tir: tes10[3], plazo: tes10[4] }, snap.ust10Curva, snap.datos.curveDate)
    : null;
  return Response.json({
    aviso: "Dato del día, no tiempo real.",
    actualizado: snap.actualizado,
    trm: snap.trm ? { valor: snap.trm.valor, fecha: snap.trm.fecha, fuente: "datos.gov.co · Superfinanciera" } : null,
    ust10: snap.ust10 ? { valor: snap.ust10.valor, fecha: snap.ust10.fecha, fuente: "Tesoro de EE. UU. (curva par diaria)" } : null,
    sofr: snap.sofr ? { valor: snap.sofr.valor, fecha: snap.sofr.fecha, fuente: "Fed de Nueva York" } : null,
    spreadTes10Ust10: spread
      ? { pb: spread.pb, fecha: spread.fecha, tes: spread.tes, ust: spread.ust, fuente: "Curva TES cargada − Tesoro de EE. UU. (misma fecha, ambas en E.A.)" }
      : null,
  });
}
