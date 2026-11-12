"use client";
/* Controles del fondeo (tipo, tasa, modalidad, haircut y supuestos del exterior). Los comparten la
   calculadora y el portafolio: la configuración se guarda una sola vez en el navegador. */
import type { ReactNode } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { CONFIG_INICIAL, type ConfigFondeo, type MercadoFondeo } from "@/lib/carry/config";
import { NOMBRE_FONDEO, type TipoFondeo } from "@/lib/carry/fondeo";
import type { Capitalizacion } from "@/lib/carry/tasas";
import { F } from "@/lib/format";
import { useGuardado } from "@/lib/storage";

/** Configuración guardada, completada con los valores iniciales (por si viene de una versión anterior). */
export function useFondeo() {
  const [guardada, fijar] = useGuardado<ConfigFondeo>("fondeo", CONFIG_INICIAL);
  const c: ConfigFondeo = { ...CONFIG_INICIAL, ...guardada, exterior: { ...CONFIG_INICIAL.exterior, ...guardada.exterior } };
  const cambiar = (x: Partial<ConfigFondeo>) => fijar((p) => ({ ...CONFIG_INICIAL, ...p, ...x }));
  const cambiarExt = (x: Partial<ConfigFondeo["exterior"]>) =>
    fijar((p) => ({ ...CONFIG_INICIAL, ...p, exterior: { ...CONFIG_INICIAL.exterior, ...p.exterior, ...x } }));
  return { c, cambiar, cambiarExt };
}

/** Dato de mercado para el exterior: SOFR (Fed de Nueva York) y TRM. */
export function useMercadoFondeo(): MercadoFondeo & { sofrFecha?: string; trmFecha?: string } {
  const { snap } = useApp();
  return { sofr: snap.sofr?.valor ?? null, spot: snap.trm?.valor ?? null, sofrFecha: snap.sofr?.fecha, trmFecha: snap.trm?.fecha };
}

const redondear = (x: number, d = 6) => +x.toFixed(d);

/** Campo numérico en % que guarda la fracción. */
function CampoPct({ id, etiqueta, valor, onCambio, paso = "0.01", sufijo = "%", factor = 100, ayuda }: {
  id: string;
  etiqueta: ReactNode;
  valor: number | null;
  onCambio: (v: number | null) => void;
  paso?: string;
  sufijo?: string;
  factor?: number;
  ayuda?: ReactNode;
}) {
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
        />
        <span>{sufijo}</span>
      </div>
      {ayuda && <span className="src">{ayuda}</span>}
    </div>
  );
}

const TIPOS = Object.keys(NOMBRE_FONDEO) as TipoFondeo[];

export function ControlesFondeo({ id }: { id: string }) {
  const { c, cambiar } = useFondeo();
  const propio = c.tipo === "propio",
    exterior = c.tipo === "exterior";
  return (
    <div className="fondeo-campos">
      <div className="f">
        <label htmlFor={id + "-tipo"}>Tipo de fondeo</label>
        <select id={id + "-tipo"} value={c.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoFondeo })}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_FONDEO[t]}
            </option>
          ))}
        </select>
      </div>
      {!propio && !exterior && (
        <>
          <CampoPct id={id + "-tasa"} etiqueta="Tasa del fondeo" valor={c.tasa} onCambio={(v) => cambiar({ tasa: v ?? 0 })} />
          <div className="f">
            <label htmlFor={id + "-mod"}>Modalidad</label>
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
        </>
      )}
      {!propio && <CampoPct id={id + "-hc"} etiqueta="Haircut" valor={c.haircut} onCambio={(v) => cambiar({ haircut: Math.min(1, Math.max(0, v ?? 0)) })} paso="1" />}
      {exterior && <p className="src fondeo-nota">Tasa en pesos del exterior: se toma de la comparación de abajo ({c.exterior.cobertura === "cubierto" ? "cubierto con forward" : "sin cubrir"}).</p>}
    </div>
  );
}

export function ControlesExterior({ id }: { id: string }) {
  const { c, cambiarExt } = useFondeo();
  const m = useMercadoFondeo();
  const e = c.exterior;
  const usaReferencia = c.tipo === "exterior" || c.tipo === "propio";
  return (
    <div className="fondeo-campos">
      <CampoPct
        id={id + "-sofr"}
        etiqueta="SOFR"
        valor={e.sofr ?? m.sofr}
        onCambio={(v) => cambiarExt({ sofr: v })}
        paso="0.01"
        ayuda={
          e.sofr == null
            ? m.sofr != null
              ? `Fed de Nueva York · ${F.date(m.sofrFecha!)}`
              : "Sin dato en vivo: ingrésela"
            : (
                <button type="button" className="enlace" onClick={() => cambiarExt({ sofr: null })}>
                  Usar dato en vivo
                </button>
              )
        }
      />
      <CampoPct id={id + "-spread"} etiqueta="Spread sobre SOFR" valor={e.spread} onCambio={(v) => cambiarExt({ spread: v ?? 0 })} paso="1" sufijo="pb" factor={1e4} />
      <CampoPct id={id + "-dev"} etiqueta="Devaluación esperada (E.A.)" valor={e.devEsperada} onCambio={(v) => cambiarExt({ devEsperada: v ?? 0 })} ayuda="Supuesto para el costo sin cubrir" />
      <CampoPct
        id={id + "-pts"}
        etiqueta="Puntos forward (opcional)"
        valor={e.puntosForward}
        onCambio={(v) => cambiarExt({ puntosForward: v })}
        paso="0.01"
        sufijo="COP"
        factor={1}
        ayuda="Vacío: paridad cubierta de tasas"
      />
      <CampoPct id={id + "-plazo"} etiqueta="Plazo del forward" valor={e.plazoDias} onCambio={(v) => cambiarExt({ plazoDias: Math.max(1, Math.round(v ?? 90)) })} paso="1" sufijo="días" factor={1} />
      <div className="f">
        <label htmlFor={id + "-cob"}>Si se fondea en USD</label>
        <select id={id + "-cob"} value={e.cobertura} onChange={(ev) => cambiarExt({ cobertura: ev.target.value as "cubierto" | "sinCubrir" })}>
          <option value="cubierto">Cubierto con forward</option>
          <option value="sinCubrir">Sin cubrir</option>
        </select>
      </div>
      {usaReferencia && (
        <CampoPct id={id + "-cop"} etiqueta="Tasa en pesos de referencia (E.A.)" valor={e.tasaCOP} onCambio={(v) => cambiarExt({ tasaCOP: v ?? 0 })} ayuda="Con qué se compara el exterior" />
      )}
    </div>
  );
}
