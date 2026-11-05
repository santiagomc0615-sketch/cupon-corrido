"use client";
/* Estado de cada serie de mercado: en vivo, cargada o respaldo del Excel, con fuente y fecha. */
import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import type { ClaveFuente, EstadoFuente } from "@/lib/data/combinar";
import { F } from "@/lib/format";

export const NOMBRES_FUENTE: Record<ClaveFuente, string> = {
  tpm: "Tasa de política monetaria",
  ibr: "IBR overnight, 1, 3 y 6 meses",
  ibr12: "IBR 12 meses",
  uvr: "UVR",
  ipc: "IPC (índice DANE)",
  exp: "Expectativas de inflación",
  tes: "Curva TES",
  frac: "Curvas FRAC",
  trm: "TRM",
};

const ACTUALIZACION: Record<ClaveFuente, string> = {
  tpm: "Diaria (automática)",
  ibr: "Diaria (automática)",
  ibr12: "Carga manual",
  uvr: "Diaria (automática)",
  ipc: "Mensual · carga manual",
  exp: "Mensual · carga manual",
  tes: "Carga manual",
  frac: "Carga manual",
  trm: "Diaria (automática)",
};

const ETIQUETA: Record<EstadoFuente, [string, string]> = {
  "en-vivo": ["En vivo", "pos"],
  cargado: ["Cargado", "warn"],
  respaldo: ["Respaldo Excel", ""],
};

export function ChipEstado({ estado }: { estado: EstadoFuente }) {
  const [t, c] = ETIQUETA[estado];
  return (
    <span className={"chip " + c}>
      <span className="dot" />
      {t}
    </span>
  );
}

export function TablaFuentes() {
  const { snap } = useApp();
  const claves = Object.keys(NOMBRES_FUENTE) as ClaveFuente[];
  return (
    <div className="tbl" style={{ maxHeight: "none" }}>
      <table>
        <thead>
          <tr>
            <th>Serie</th>
            <th>Estado</th>
            <th>Fuente</th>
            <th>Último dato</th>
            <th>Actualización</th>
          </tr>
        </thead>
        <tbody>
          {claves.map((k) => {
            const f = snap.fuentes[k];
            if (!f) return null;
            return (
              <tr key={k} title={f.detalle}>
                <td className="t">{NOMBRES_FUENTE[k]}</td>
                <td className="t">
                  <ChipEstado estado={f.estado} />
                </td>
                <td className="t">
                  {f.fuente}
                  {f.detalle && <span className="src"> · {f.detalle}</span>}
                </td>
                <td>{f.hasta ? F.date(f.hasta) : "—"}</td>
                <td className="t">{ACTUALIZACION[k]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ResumenFuentes() {
  const { snap } = useApp();
  const claves = Object.keys(NOMBRES_FUENTE) as ClaveFuente[];
  const grupo = (e: EstadoFuente) => claves.filter((k) => snap.fuentes[k]?.estado === e).map((k) => NOMBRES_FUENTE[k]);
  const vivo = grupo("en-vivo"),
    cargado = grupo("cargado"),
    respaldo = grupo("respaldo");
  return (
    <span>
      {vivo.length ? <>En vivo (BanRep SDMX y datos.gov.co): {vivo.join(", ")}. </> : <>Sin conexión con las fuentes en vivo. </>}
      {cargado.length > 0 && <>Cargado en la página: {cargado.join(", ")}. </>}
      {respaldo.length > 0 && <>Del Excel del curso: {respaldo.join(", ")}. </>}
      Actualizado {snap.actualizado.replace(" ", " · ")} (hora de Colombia). <Link href="/noticias">Ver estado de cada serie</Link> ·{" "}
      <Link href="/datos">Cargar datos</Link>
    </span>
  );
}
