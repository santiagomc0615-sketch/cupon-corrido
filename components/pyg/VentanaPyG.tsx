"use client";
/* Ventana P&G: estado de resultados de la inversión al vender (o al vencimiento), con impuestos e
   inflación, en pesos y en % del capital. Se abre con <BotonPyG>, que recibe cómo armar las entradas
   (lib/pyg). Animación: las líneas entran en cascada y el total cuenta hasta su valor; con
   prefers-reduced-motion todo aparece de una vez (CSS y Contador). */
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Contador } from "@/components/cliente/Contador";
import { F, nf } from "@/lib/format";
import { NOMBRE_CONTRIBUYENTE } from "@/lib/impuestos/perfil";
import { estadoPyG, textoRent, type EntradasPyG } from "@/lib/pyg/estado";
import { conFondeo, type FondeoPyG } from "@/lib/pyg/fondeo";
import { AvisoTributario, PanelImpuestos, useImpuestos } from "./Impuestos";

const pesos = (v: number) => (v < 0 ? "−" : "") + "$ " + nf(0).format(Math.abs(Math.round(v)));

/** Clase de color por signo (negativos en rojo, positivos en verde; cero neutro). */
const signo = (v: number) => (v > 0.5 ? "v-pos" : v < -0.5 ? "v-neg" : "");

export function TablaPyG({ entradas, comisiones, id, fondeo = null }: { entradas: EntradasPyG; comisiones: number; id: string; fondeo?: FondeoPyG | null }) {
  const { params, perfil } = useImpuestos();
  // Por defecto, capital propio; el fondeo del panel de carry se incluye solo si el usuario lo activa.
  const [incluir, setIncluir] = useState(false);
  const usarFondeo = !!fondeo && incluir;
  const r = useMemo(() => {
    const base = { ...entradas, comisiones, costoFondeo: 0, fondeo: undefined };
    return estadoPyG(usarFondeo && fondeo ? conFondeo(base, fondeo) : base, perfil, params);
  }, [entradas, comisiones, perfil, params, usarFondeo, fondeo]);
  const pct = (v: number) => (r.capital && v ? F.pct(v / r.capital, 2) : F.pct(0, 2)).replace(/^-/, "−");
  const rent = (x: number | null) => <b className={x == null ? "v-neg" : signo(x * 1e6)}>{textoRent(x)}</b>;
  return (
    <div className="pyg">
      {fondeo && (
        <div className="pyg-fondeo" role="group" aria-label="Fondeo en el P&G">
          <span>
            <b>Fondeo activo:</b> {fondeo.descripcion}. {usarFondeo ? "Incluido: los % se miden sobre el capital propio." : "No incluido: el P&G se calcula con capital propio."}
          </span>
          <label className="interruptor">
            <input type="checkbox" role="switch" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} />
            <span>
              <b>Incluir fondeo</b>
            </span>
          </label>
        </div>
      )}
      <table className="pyg-tabla" aria-describedby={`${id}-frase`}>
        <caption className="sr-only">Estado de resultados de la inversión</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Signo</span>
            </th>
            <th scope="col">Concepto</th>
            <th scope="col">Pesos</th>
            <th scope="col">{usarFondeo ? "% del capital propio" : "% del capital"}</th>
          </tr>
        </thead>
        <tbody>
          {r.lineas.map((l, i) => (
            <tr key={l.clave} className={`pyg-${l.tipo}`} style={{ "--i": i } as React.CSSProperties}>
              <td className="pyg-signo" aria-hidden="true">
                {l.signo}
              </td>
              <th scope="row">
                {l.etiqueta}
                {l.nota ? <span className="src">{l.nota}</span> : null}
              </th>
              <td className={l.tipo === "info" ? "" : signo(l.valor)}>{l.clave === "real" ? <Contador valor={l.valor} formato={pesos} /> : pesos(l.valor)}</td>
              <td className={l.tipo === "info" ? "" : signo(l.valor)}>{pct(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pyg-rent">
        <div>
          <span className="src">Rentabilidad nominal</span>
          {rent(r.rentNominal)}
          <span className="src">E.A. antes de impuestos</span>
        </div>
        <div>
          <span className="src">Después de impuestos</span>
          {rent(r.rentDespues)}
          <span className="src">E.A.</span>
        </div>
        <div className="pyg-real">
          <span className="src">Real</span>
          {rent(r.rentReal)}
          <span className="src">E.A. después de impuestos e inflación</span>
        </div>
      </div>
      <p className="pyg-frase" id={`${id}-frase`}>
        {r.frase}
      </p>
      {r.notas.map((n) => (
        <p key={n} className="src">
          {n}
        </p>
      ))}
      <p className="src">
        {nf(0).format(r.dias)} días de tenencia · {usarFondeo ? `capital propio ${pesos(r.capital)} de un giro de ${pesos(entradas.capital)}` : `capital invertido ${pesos(entradas.capital)}`} ·
        inflación del periodo {F.pct(entradas.inflacion, 2)}
        {entradas.inflacionProyectada ? " (proyectada con las expectativas de la encuesta del BanRep)" : " (IPC del DANE)"} · {NOMBRE_CONTRIBUYENTE[perfil.tipo]}
      </p>
    </div>
  );
}

/** Botón que abre la ventana P&G. `construir` arma las entradas cuando se abre. */
export function BotonPyG({
  construir,
  titulo,
  subtitulo,
  etiqueta = "Ver P&G",
  controles,
  className = "btn",
  fondeo = null,
}: {
  construir: () => EntradasPyG | { error: string };
  titulo: string;
  subtitulo?: string;
  etiqueta?: string;
  /** Controles extra dentro de la ventana (p. ej. la fecha de venta del portafolio). */
  controles?: ReactNode;
  className?: string;
  /** Fondeo del panel de carry, para ofrecerlo con un interruptor (apagado por defecto). */
  fondeo?: FondeoPyG | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  const [comisiones, setComisiones] = useState(0);
  const [verPerfil, setVerPerfil] = useState(false);
  const entradas = abierta ? construir() : null;

  const abrir = () => {
    setAbierta(true);
    ref.current?.showModal();
  };
  const cerrar = () => {
    ref.current?.close();
  };

  return (
    <>
      <button type="button" className={className} onClick={abrir}>
        {etiqueta}
      </button>
      <dialog ref={ref} className="ventana-pyg" aria-labelledby={`${id}-t`} onClose={() => setAbierta(false)} onClick={(e) => e.target === ref.current && cerrar()}>
        {abierta && (
          <div className="ventana-cuerpo">
            <header className="ventana-cab">
              <div>
                <span className="eyebrow">Estado de resultados (P&G)</span>
                <h2 id={`${id}-t`}>{titulo}</h2>
                {subtitulo && <p className="src">{subtitulo}</p>}
              </div>
              <button type="button" className="btn ventana-cerrar" onClick={cerrar} aria-label="Cerrar la ventana P&G">
                Cerrar
              </button>
            </header>
            <AvisoTributario />
            <div className="ventana-controles">
              {controles}
              <div className="f">
                <label htmlFor={`${id}-com`}>Comisiones</label>
                <div className="u">
                  <input
                    id={`${id}-com`}
                    type="number"
                    min={0}
                    step={10000}
                    inputMode="numeric"
                    value={comisiones}
                    onChange={(e) => setComisiones(Math.max(0, +e.target.value || 0))}
                    style={{ paddingRight: 26 }}
                  />
                  <span>$</span>
                </div>
              </div>
              <button type="button" className="btn" aria-expanded={verPerfil} onClick={() => setVerPerfil(!verPerfil)}>
                {verPerfil ? "Ocultar perfil e impuestos" : "Perfil e impuestos"}
              </button>
            </div>
            {verPerfil && <PanelImpuestos />}
            {entradas && "error" in entradas ? (
              <p className="alert" role="alert">
                {entradas.error}
              </p>
            ) : entradas ? (
              <TablaPyG entradas={entradas} comisiones={comisiones} id={id} fondeo={fondeo} />
            ) : null}
          </div>
        )}
      </dialog>
    </>
  );
}
