"use client";
/* Controles del fondeo (tipo, tasa, haircut y supuestos del exterior). Los comparten la calculadora
   y el portafolio: la configuración se guarda una sola vez en el navegador.
   Cada dato de mercado es automático (del día, con fuente y fecha); si el usuario escribe otro valor,
   manda el suyo hasta que pulse «Usar dato en vivo». */
import type { ReactNode } from "react";
import { useApp } from "@/components/providers/AppProvider";
import {
  CONFIG_INICIAL,
  comparacion,
  devUltimos12m,
  ibrParaPlazo,
  tasaCOPMercado,
  tasaLocalEA,
  type ConfigFondeo,
  type MercadoFondeo,
} from "@/lib/carry/config";
import { NOMBRE_FONDEO, type TipoFondeo } from "@/lib/carry/fondeo";
import type { Capitalizacion } from "@/lib/carry/tasas";
import { F, nf } from "@/lib/format";
import { useGuardado } from "@/lib/storage";

/** Configuración guardada, completada con los valores iniciales (por si viene de una versión anterior). */
export function useFondeo() {
  const [guardada, fijar] = useGuardado<ConfigFondeo>("fondeo-v2", CONFIG_INICIAL);
  const c: ConfigFondeo = { ...CONFIG_INICIAL, ...guardada, exterior: { ...CONFIG_INICIAL.exterior, ...guardada.exterior } };
  const cambiar = (x: Partial<ConfigFondeo>) => fijar((p) => ({ ...CONFIG_INICIAL, ...p, ...x }));
  const cambiarExt = (x: Partial<ConfigFondeo["exterior"]>) =>
    fijar((p) => ({ ...CONFIG_INICIAL, ...p, exterior: { ...CONFIG_INICIAL.exterior, ...p.exterior, ...x } }));
  return { c, cambiar, cambiarExt };
}

/** Datos de mercado del día para el fondeo: TPM e IBR (BanRep), SOFR (Fed NY) y TRM (datos.gov.co). */
export function useMercadoFondeo(): MercadoFondeo & { fuenteTpm?: string; fuenteIbr?: string } {
  const { snap } = useApp();
  const ultIbr = snap.datos.ibr[snap.datos.ibr.length - 1];
  return {
    sofr: snap.sofr?.valor ?? null,
    sofrFecha: snap.sofr?.fecha,
    spot: snap.trm?.valor ?? null,
    spotFecha: snap.trm?.fecha,
    spot12m: snap.trm?.hace12m ?? null,
    tpm: snap.macro.tpm ?? null,
    tpmFecha: snap.macro.tpmFecha,
    fuenteTpm: snap.fuentes.tpm?.fuente,
    ibr: ultIbr ? { fecha: ultIbr[0], on: ultIbr[1] / 100, m1: ultIbr[2] / 100, m3: ultIbr[3] / 100, m6: ultIbr[4] / 100 } : null,
    fuenteIbr: snap.fuentes.ibr?.fuente,
  };
}

const redondear = (x: number, d = 6) => +x.toFixed(d);

/** Campo numérico que guarda la fracción (o null). Con `vivo`, muestra el dato del día mientras no se escriba otro. */
function Campo({
  id,
  etiqueta,
  manual,
  vivo,
  onCambio,
  paso = "0.01",
  sufijo = "%",
  factor = 100,
  ayuda,
  fuenteVivo,
}: {
  id: string;
  etiqueta: ReactNode;
  /** Valor ingresado (null = no se ingresó). */
  manual: number | null;
  /** Dato del día, si el campo es automático. */
  vivo?: number | null;
  onCambio: (v: number | null) => void;
  paso?: string;
  sufijo?: string;
  factor?: number;
  ayuda?: ReactNode;
  /** Fuente y fecha del dato del día. */
  fuenteVivo?: string;
}) {
  const automatico = vivo !== undefined;
  const valor = manual ?? vivo ?? null;
  return (
    <div className="f">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="u">
        <input
          id={id}
          type="number"
          step={paso}
          inputMode="decimal"
          value={valor == null || Number.isNaN(valor) ? "" : redondear(valor * factor)}
          onChange={(e) => onCambio(e.target.value === "" ? null : +e.target.value / factor)}
          style={{ paddingRight: 12 + sufijo.length * 7.5 }}
          aria-describedby={id + "-ayuda"}
        />
        <span>{sufijo}</span>
      </div>
      <span className="src" id={id + "-ayuda"}>
        {automatico &&
          (manual == null ? (
            vivo != null ? (
              <span className="vivo">En vivo · {fuenteVivo}</span>
            ) : (
              "Sin dato en vivo: ingréselo"
            )
          ) : (
            <>
              Valor propio ·{" "}
              <button type="button" className="enlace" onClick={() => onCambio(null)}>
                usar dato en vivo
              </button>
            </>
          ))}
        {ayuda && (automatico ? <> · {ayuda}</> : ayuda)}
      </span>
    </div>
  );
}

const TIPOS = Object.keys(NOMBRE_FONDEO) as TipoFondeo[];
const conFecha = (fuente: string | undefined, fecha: string | undefined) => `${fuente ?? ""}${fecha ? " · " + F.date(fecha) : ""}`;

export function ControlesFondeo({ id }: { id: string }) {
  const { c, cambiar } = useFondeo();
  const m = useMercadoFondeo();
  const propio = c.tipo === "propio",
    exterior = c.tipo === "exterior",
    credito = c.tipo === "credito";
  // Dato del día para la tasa (solo simultánea e interbancario tienen uno público).
  const vivo =
    c.tipo === "repo" ? (m.tpm ?? null) : c.tipo === "ibr" ? (m.ibr?.on ?? null) : undefined;
  const fuenteVivo =
    c.tipo === "repo" ? "TPM " + conFecha(m.fuenteTpm, m.tpmFecha) : c.tipo === "ibr" ? "IBR overnight N.A. " + conFecha(m.fuenteIbr, m.ibr?.fecha) : undefined;
  const ea = tasaLocalEA(c, m);
  return (
    <div className="fondeo-campos">
      <div className="f">
        <label htmlFor={id + "-tipo"}>Tipo de fondeo</label>
        <select id={id + "-tipo"} value={c.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoFondeo, tasa: null })}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_FONDEO[t]}
            </option>
          ))}
        </select>
      </div>
      {!propio && !exterior && (
        <Campo
          id={id + "-tasa"}
          etiqueta={c.tipo === "ibr" ? "IBR overnight" : "Tasa del fondeo"}
          manual={c.tasa}
          vivo={credito ? undefined : vivo}
          onCambio={(v) => cambiar({ tasa: v })}
          fuenteVivo={fuenteVivo}
          ayuda={ea != null && (c.tasa != null || c.tipo === "ibr") ? `${F.pct(ea, 3)} E.A.` : credito && c.tasa == null ? "Ingrese la tasa del crédito" : undefined}
        />
      )}
      {c.tipo === "ibr" && c.tasa == null && (
        <Campo id={id + "-sibr"} etiqueta="Spread sobre IBR (N.A.)" manual={c.spreadIbr} onCambio={(v) => cambiar({ spreadIbr: v ?? 0 })} paso="1" sufijo="pb" factor={1e4} />
      )}
      {!propio && !exterior && c.tasa != null && (
        <div className="f">
          <label htmlFor={id + "-mod"}>Modalidad de la tasa</label>
          <select
            id={id + "-mod"}
            value={c.modalidad === "EA" ? "EA" : c.capitalizacion}
            onChange={(e) =>
              e.target.value === "EA" ? cambiar({ modalidad: "EA" }) : cambiar({ modalidad: "NA", capitalizacion: e.target.value as Capitalizacion })
            }
          >
            <option value="EA">E.A.</option>
            <option value="diaria">N.A. diaria</option>
            <option value="mensual">N.A. mes vencido</option>
            <option value="trimestral">N.A. trimestre vencido</option>
            <option value="semestral">N.A. semestre vencido</option>
          </select>
        </div>
      )}
      {!propio && (
        <Campo id={id + "-hc"} etiqueta="Haircut" manual={c.haircut} onCambio={(v) => cambiar({ haircut: Math.min(1, Math.max(0, v ?? 0)) })} paso="1" />
      )}
      {exterior && (
        <p className="src fondeo-nota">
          La tasa en pesos del exterior sale de la comparación de abajo ({c.exterior.cobertura === "cubierto" ? "cubierto con forward" : "sin cubrir"}).
        </p>
      )}
    </div>
  );
}

export function ControlesExterior({ id }: { id: string }) {
  const { c, cambiarExt } = useFondeo();
  const m = useMercadoFondeo();
  const e = c.exterior;
  const cmp = comparacion(c, m, 0);
  const dev12 = devUltimos12m(m);
  const ibrPlazo = m.ibr ? ibrParaPlazo(m.ibr, e.plazoDias) : null;
  const usaReferencia = c.tipo === "exterior" || c.tipo === "propio";
  return (
    <>
      <p className="src datos-dia">
        Datos del día:{" "}
        {m.sofr != null ? `SOFR ${F.pct(m.sofr, 2)} (Fed de Nueva York · ${F.date(m.sofrFecha!)})` : "SOFR sin dato"} ·{" "}
        {m.spot ? `TRM ${nf(2).format(m.spot)} (datos.gov.co · ${F.date(m.spotFecha!)})` : "TRM sin dato"}
        {ibrPlazo ? ` · IBR ${ibrPlazo.plazo} ${F.pct(ibrPlazo.ea, 3)} E.A. (${conFecha(m.fuenteIbr, m.ibr?.fecha)})` : ""}. Se actualizan
        solos dos veces al día.
      </p>
      <div className="fondeo-campos">
        <Campo id={id + "-sofr"} etiqueta="SOFR" manual={e.sofr} vivo={m.sofr} onCambio={(v) => cambiarExt({ sofr: v })} fuenteVivo={`Fed de Nueva York · ${m.sofrFecha ? F.date(m.sofrFecha) : "—"}`} />
        <Campo
          id={id + "-spread"}
          etiqueta="Spread sobre SOFR"
          manual={e.spread}
          onCambio={(v) => cambiarExt({ spread: v ?? 0 })}
          paso="1"
          sufijo="pb"
          factor={1e4}
          ayuda="Lo que cobra el prestamista: depende de cada crédito"
        />
        <Campo
          id={id + "-dev"}
          etiqueta="Devaluación esperada (E.A.)"
          manual={e.devEsperada}
          vivo={cmp ? cmp.devForward : null}
          onCambio={(v) => cambiarExt({ devEsperada: v })}
          fuenteVivo="implícita del mercado (paridad)"
          ayuda={
            dev12 != null ? (
              <>
                últimos 12 meses {F.pct(dev12, 2)}{" "}
                <button type="button" className="enlace" onClick={() => cambiarExt({ devEsperada: dev12 })}>
                  usar
                </button>
              </>
            ) : undefined
          }
        />
        <Campo
          id={id + "-pts"}
          etiqueta="Puntos forward (opcional)"
          manual={e.puntosForward}
          onCambio={(v) => cambiarExt({ puntosForward: v })}
          sufijo="COP"
          factor={1}
          ayuda="Vacío: paridad cubierta con IBR y SOFR del día"
        />
        <Campo
          id={id + "-plazo"}
          etiqueta="Plazo del forward"
          manual={e.plazoDias}
          onCambio={(v) => cambiarExt({ plazoDias: Math.max(1, Math.round(v ?? 90)) })}
          paso="1"
          sufijo="días"
          factor={1}
        />
        <div className="f">
          <label htmlFor={id + "-cob"}>Si se fondea en USD</label>
          <select id={id + "-cob"} value={e.cobertura} onChange={(ev) => cambiarExt({ cobertura: ev.target.value as "cubierto" | "sinCubrir" })}>
            <option value="cubierto">Cubierto con forward</option>
            <option value="sinCubrir">Sin cubrir</option>
          </select>
        </div>
        {usaReferencia && (
          <Campo
            id={id + "-cop"}
            etiqueta="Tasa en pesos de referencia (E.A.)"
            manual={e.tasaCOP}
            vivo={tasaCOPMercado(c, m)}
            onCambio={(v) => cambiarExt({ tasaCOP: v })}
            fuenteVivo={ibrPlazo ? `IBR ${ibrPlazo.plazo} · ${conFecha(m.fuenteIbr, m.ibr?.fecha)}` : "TPM"}
          />
        )}
      </div>
    </>
  );
}
