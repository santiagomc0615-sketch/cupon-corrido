/* Banco de la República — servicio web SDMX oficial (https://totoro.banrep.gov.co/nsi-jax-ws/rest).
   Flujos: tasa de política monetaria (DF_CBR_DAILY_HIST), IBR (DF_IBR_DAILY_HIST), UVR (DF_UVR_DAILY_HIST) y
   DTF (DF_DTF_DAILY_HIST: promedio de las tasas de los CDT a 90 días, E.A., vigente por semana).
   Solo se usa desde el servidor. */

const BASE = "https://totoro.banrep.gov.co/nsi-jax-ws/rest/data/ESTAT,";
const TIEMPO_MAX_MS = 45_000;

export interface SerieSDMX {
  subject: string;
  unit: string;
  /** [fecha ISO, valor] en orden ascendente */
  obs: [string, number][];
}

/** "20261105" → "2026-11-05"; "2026-10" → "2026-10-01" */
function fechaSDMX(v: string): string {
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  return v.slice(0, 10);
}

/** Lee un mensaje SDMX 2.1 GenericData. */
export function leerSDMX(xml: string): SerieSDMX[] {
  return [...xml.matchAll(/<generic:Series>([\s\S]*?)<\/generic:Series>/g)].map((m) => {
    const s = m[1];
    const subject = s.match(/id="SUBJECT" value="([^"]+)"/)?.[1] ?? "";
    const unit = s.match(/id="UNIT_MEASURE" value="([^"]+)"/)?.[1] ?? "";
    const obs = [...s.matchAll(/<generic:ObsDimension value="([^"]+)"\s*\/>\s*<generic:ObsValue value="([^"]+)"/g)]
      .map((o): [string, number] => [fechaSDMX(o[1]), Number(o[2])])
      .filter(([, v]) => Number.isFinite(v))
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return { subject, unit, obs };
  });
}

async function flujo(id: string, desde: string): Promise<SerieSDMX[]> {
  const r = await fetch(`${BASE}${id},1.0/all?startPeriod=${desde}`, {
    headers: { Accept: "application/vnd.sdmx.genericdata+xml;version=2.1" },
    signal: AbortSignal.timeout(TIEMPO_MAX_MS),
  });
  if (!r.ok) throw new Error(`BanRep SDMX ${id}: HTTP ${r.status}`);
  const series = leerSDMX(await r.text());
  if (!series.some((s) => s.obs.length)) throw new Error(`BanRep SDMX ${id}: sin datos`);
  return series;
}

/** Tasa de política monetaria diaria, en % (12.25). */
export async function tpmBanRep(desde: string): Promise<[string, number][]> {
  const s = await flujo("DF_CBR_DAILY_HIST", desde);
  return s.find((x) => x.subject === "IRCBRM01")?.obs ?? s[0].obs;
}

/** IBR nominal (N.A., en %) por fecha: [fecha, overnight, 1 mes, 3 meses, 6 meses].
    El servicio no publica el IBR a 12 meses. */
export async function ibrBanRep(desde: string): Promise<[string, number, number, number, number][]> {
  const s = await flujo("DF_IBR_DAILY_HIST", desde);
  const nominal = (sub: string) => new Map(s.find((x) => x.subject === sub && x.unit === "NR")?.obs ?? []);
  const on = nominal("IRIBRM00"),
    m1 = nominal("IRIBRM01"),
    m3 = nominal("IRIBRM03"),
    m6 = nominal("IRIBRM06");
  const fechas = [...on.keys()].filter((f) => m1.has(f) && m3.has(f) && m6.has(f)).sort();
  return fechas.map((f) => [f, on.get(f)!, m1.get(f)!, m3.get(f)!, m6.get(f)!]);
}

/** DTF E.A. vigente hoy (fracción) y su fecha: el último dato publicado con fecha ≤ hoy. */
export async function dtfBanRep(hoyISO: string): Promise<{ valor: number; fecha: string }> {
  const desde = new Date(Date.parse(hoyISO) - 40 * 864e5).toISOString().slice(0, 10);
  const s = await flujo("DF_DTF_DAILY_HIST", desde);
  const obs = (s.find((x) => x.subject === "IRGBRM03")?.obs ?? s[0].obs).filter(([f]) => f <= hoyISO);
  const u = obs[obs.length - 1];
  if (!u) throw new Error("BanRep SDMX DTF: sin dato hasta hoy");
  return { valor: u[1] / 100, fecha: u[0] };
}

/** UVR diaria ($ por UVR), incluida la ya certificada para los próximos días. */
export async function uvrBanRep(desde: string): Promise<[string, number][]> {
  const s = await flujo("DF_UVR_DAILY_HIST", desde);
  return s.find((x) => x.unit === "CRVU")?.obs ?? [];
}
