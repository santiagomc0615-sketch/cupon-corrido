"use client";
/* Ventana P&G: estado de resultados de la inversión al vender (o al vencimiento), con impuestos e
   inflación, en pesos y en % del capital. Se abre con <BotonPyG>, que recibe cómo armar las entradas
   (lib/pyg). Animación: las líneas entran en cascada y el total cuenta hasta su valor; con
   prefers-reduced-motion todo aparece de una vez (CSS y Contador). */
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Contador } from "@/components/cliente/Contador";
import { F, nf } from "@/lib/format";
import { NOMBRE_CONTRIBUYENTE } from "@/lib/impuestos/perfil";
import { estadoPyG, type EntradasPyG } from "@/lib/pyg/estado";
import { AvisoTributario, PanelImpuestos, useImpuestos } from "./Impuestos";

const pesos = (v: number) => (v < 0 ? "−" : "") + "$ " + nf(0).format(Math.abs(Math.round(v)));

export function TablaPyG({ entradas, comisiones, id }: { entradas: EntradasPyG; comisiones: number; id: string }) {
  const { params, perfil } = useImpuestos();
  const r = useMemo(() => estadoPyG({ ...entradas, comisiones }, perfil, params), [entradas, comisiones, perfil, params]);
  const pct = (v: number) => F.pct(entradas.capital && v ? v / entradas.capital : 0, 2).replace(/^-/, "−");
  return (
    <div className="pyg">
      <table className="pyg-tabla" aria-describedby={`${id}-frase`}>
        <caption className="sr-only">Estado de resultados de la inversión</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Signo</span>
            </th>
            <th scope="col">Concepto</th>
            <th scope="col">Pesos</th>
            <th scope="col">% del capital</th>
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
              <td>{l.clave === "real" ? <Contador valor={l.valor} formato={pesos} /> : pesos(l.valor)}</td>
              <td>{pct(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pyg-rent">
        <div>
          <span className="src">Rentabilidad nominal</span>
          <b>{F.pct(r.rentNominal, 2)}</b>
          <span className="src">E.A. antes de impuestos</span>
        </div>
        <div>
          <span className="src">Después de impuestos</span>
          <b>{F.pct(r.rentDespues, 2)}</b>
          <span className="src">E.A.</span>
        </div>
        <div className="pyg-real">
          <span className="src">Real</span>
          <b>{F.pct(r.rentReal, 2)}</b>
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
        {nf(0).format(r.dias)} días de tenencia · capital invertido {pesos(entradas.capital)} · inflación del periodo {F.pct(entradas.inflacion, 2)}
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
}: {
  construir: () => EntradasPyG | { error: string };
  titulo: string;
  subtitulo?: string;
  etiqueta?: string;
  /** Controles extra dentro de la ventana (p. ej. la fecha de venta del portafolio). */
  controles?: ReactNode;
  className?: string;
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
              <TablaPyG entradas={entradas} comisiones={comisiones} id={id} />
            ) : null}
          </div>
        )}
      </dialog>
    </>
  );
}
