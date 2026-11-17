"use client";
/* Perfil del contribuyente y parámetros tributarios editables (guardados en el navegador), con la
   norma, fecha y enlace de cada valor y el botón «Restaurar valores oficiales». */
import { useMemo } from "react";
import { F, nf } from "@/lib/format";
import { conOficiales, FECHA_VERIFICACION, FUENTES, PARAMETROS_OFICIALES, type ParametrosTributarios } from "@/lib/impuestos/parametros";
import { NOMBRE_CONTRIBUYENTE, PERFIL_INICIAL, tarifaMarginal, type PerfilContribuyente, type TipoContribuyente } from "@/lib/impuestos/perfil";
import { useGuardado } from "@/lib/storage";

export const AVISO_TRIBUTARIO = "Estimación con fines académicos. No constituye asesoría tributaria; confirme con un contador.";

export function useImpuestos() {
  const [guardados, setGuardados] = useGuardado<Partial<ParametrosTributarios> | null>("impuestos-v1", null);
  const [perfilG, setPerfil] = useGuardado<PerfilContribuyente>("perfilContribuyente-v1", PERFIL_INICIAL);
  const params = useMemo(() => conOficiales(guardados), [guardados]);
  const perfil = useMemo(() => ({ ...PERFIL_INICIAL, ...perfilG }), [perfilG]);
  return {
    params,
    perfil,
    editados: guardados != null,
    cambiarParams: (x: Partial<ParametrosTributarios>) => setGuardados({ ...params, ...x }),
    restaurar: () => setGuardados(null),
    cambiarPerfil: (x: Partial<PerfilContribuyente>) => setPerfil({ ...perfil, ...x }),
  };
}

export function AvisoTributario() {
  return (
    <p className="aviso-trib" role="note">
      {AVISO_TRIBUTARIO}
    </p>
  );
}

/** Campo de porcentaje que guarda la fracción. */
function CampoPct({ id, etiqueta, valor, cambiar, paso = 0.01 }: { id: string; etiqueta: string; valor: number; cambiar: (v: number) => void; paso?: number }) {
  return (
    <div className="f">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="u">
        <input
          id={id}
          type="number"
          step={paso}
          inputMode="decimal"
          value={+(valor * 100).toFixed(4)}
          onChange={(e) => e.target.value !== "" && cambiar(Math.round(+e.target.value * 1e6) / 1e8)}
          style={{ paddingRight: 26 }}
        />
        <span>%</span>
      </div>
    </div>
  );
}

function Fuente({ k }: { k: keyof ParametrosTributarios }) {
  const f = FUENTES[k];
  if (!f) return null;
  return (
    <p className="src fuente-trib">
      <a href={f.enlace} target="_blank" rel="noopener noreferrer">
        {f.norma}
      </a>{" "}
      · {F.date(f.fecha)}
      {f.nota ? <> · {f.nota}</> : null}
    </p>
  );
}

export function PanelImpuestos() {
  const { params: p, perfil, editados, cambiarParams, restaurar, cambiarPerfil } = useImpuestos();
  const natural = perfil.tipo !== "juridica";
  const marginal = natural && perfil.ingresosAnuales != null ? tarifaMarginal(perfil.ingresosAnuales, p) : null;
  return (
    <div className="impuestos">
      <div className="f">
        <label htmlFor="trib-tipo">Perfil del contribuyente</label>
        <select id="trib-tipo" value={perfil.tipo} onChange={(e) => cambiarPerfil({ tipo: e.target.value as TipoContribuyente })}>
          {(Object.keys(NOMBRE_CONTRIBUYENTE) as TipoContribuyente[]).map((t) => (
            <option key={t} value={t}>
              {NOMBRE_CONTRIBUYENTE[t]}
            </option>
          ))}
        </select>
      </div>
      {natural && (
        <div className="impuestos-fila">
          <div className="f">
            <label htmlFor="trib-ingresos">Ingresos anuales aproximados (opcional)</label>
            <div className="u">
              <input
                id="trib-ingresos"
                type="number"
                min={0}
                step={1000000}
                inputMode="numeric"
                placeholder="Para la tarifa del art. 241"
                value={perfil.ingresosAnuales ?? ""}
                onChange={(e) => cambiarPerfil({ ingresosAnuales: e.target.value === "" ? null : Math.max(0, +e.target.value) })}
                style={{ paddingRight: 26 }}
              />
              <span>$</span>
            </div>
            <span className="src">
              {marginal != null
                ? `${nf(0).format((perfil.ingresosAnuales ?? 0) / p.uvt)} UVT · tarifa marginal ${F.pct(marginal, 0)} (art. 241)`
                : "Sin ingresos se usa la tarifa de al lado"}
            </span>
          </div>
          {perfil.ingresosAnuales == null && (
            <CampoPct id="trib-tarifa" etiqueta="Tarifa marginal (editable)" valor={perfil.tarifaManual} cambiar={(v) => cambiarPerfil({ tarifaManual: v })} paso={1} />
          )}
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={perfil.gmf} onChange={(e) => cambiarPerfil({ gmf: e.target.checked })} />
        Incluir el GMF (4 × 1.000) sobre el dinero que se retira
      </label>

      <details className="params-trib">
        <summary>
          Parámetros tributarios {editados ? <span className="chip warn">editados</span> : <span className="chip">oficiales</span>}
          <span className="src"> · verificados el {F.date(FECHA_VERIFICACION)}</span>
        </summary>
        <div className="params-grid">
          <div>
            <CampoPct id="p-ret" etiqueta="Retención en la fuente (renta fija, CDT y TES)" valor={p.retencion} cambiar={(v) => cambiarParams({ retencion: v })} />
            <Fuente k="retencion" />
          </div>
          <div>
            <CampoPct
              id="p-ci"
              etiqueta={`Componente inflacionario no gravado (año ${p.anioComponente})`}
              valor={p.componenteInflacionario}
              cambiar={(v) => cambiarParams({ componenteInflacionario: v })}
            />
            <Fuente k="componenteInflacionario" />
          </div>
          <div>
            <div className="f">
              <label htmlFor="p-uvt">UVT {p.anioUvt}</label>
              <div className="u">
                <input id="p-uvt" type="number" step={1} value={p.uvt} onChange={(e) => +e.target.value > 0 && cambiarParams({ uvt: +e.target.value })} style={{ paddingRight: 26 }} />
                <span>$</span>
              </div>
            </div>
            <Fuente k="uvt" />
          </div>
          <div>
            <CampoPct id="p-go" etiqueta="Ganancia ocasional" valor={p.gananciaOcasional} cambiar={(v) => cambiarParams({ gananciaOcasional: v })} paso={1} />
            <Fuente k="aniosGananciaOcasional" />
          </div>
          <div>
            <CampoPct id="p-pj" etiqueta="Renta de personas jurídicas" valor={p.rentaJuridica} cambiar={(v) => cambiarParams({ rentaJuridica: v })} paso={1} />
            <Fuente k="rentaJuridica" />
          </div>
          <div>
            <CampoPct id="p-gmf" etiqueta="GMF" valor={p.gmf} cambiar={(v) => cambiarParams({ gmf: v })} paso={0.1} />
            <Fuente k="gmf" />
          </div>
        </div>
        <div className="tbl" style={{ maxHeight: "none", marginTop: 10 }}>
          <table>
            <caption className="src" style={{ textAlign: "left", captionSide: "top", paddingBottom: 6 }}>
              Tabla del art. 241 E.T. (personas naturales residentes) · <a href={FUENTES.tabla241!.enlace} target="_blank" rel="noopener noreferrer">norma</a>
            </caption>
            <thead>
              <tr>
                <th>Desde (UVT)</th>
                <th>Hasta (UVT)</th>
                <th>Tarifa marginal</th>
                <th>Más (UVT)</th>
              </tr>
            </thead>
            <tbody>
              {p.tabla241.map((t, i) => (
                <tr key={i}>
                  <td>{nf(0).format(t.desde)}</td>
                  <td>{t.hasta == null ? "En adelante" : nf(0).format(t.hasta)}</td>
                  <td>
                    <input
                      className="ii-in num"
                      type="number"
                      step={1}
                      aria-label={`Tarifa del tramo desde ${t.desde} UVT`}
                      value={+(t.tarifa * 100).toFixed(2)}
                      onChange={(e) =>
                        e.target.value !== "" && cambiarParams({ tabla241: p.tabla241.map((x, j) => (j === i ? { ...x, tarifa: +e.target.value / 100 } : x)) })
                      }
                    />
                  </td>
                  <td>{nf(0).format(t.fijo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="params-acciones">
          <button type="button" className="btn" onClick={restaurar} disabled={!editados}>
            Restaurar valores oficiales
          </button>
          <span className="src">
            Valores oficiales: retención {F.pct(PARAMETROS_OFICIALES.retencion, 0)}, componente inflacionario{" "}
            {F.pct(PARAMETROS_OFICIALES.componenteInflacionario, 2)}, UVT {F.cop(PARAMETROS_OFICIALES.uvt)}.
          </span>
        </div>
      </details>
    </div>
  );
}
