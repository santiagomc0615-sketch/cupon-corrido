"use client";
/* Pestaña «Buscar objetivo» de la calculadora: «Quiero que [resultado] sea igual a [valor] cambiando
   [variable]», como en Excel, y las preguntas rápidas del parcial. Todo se resuelve en lib/objetivo
   (Brent sobre el motor, sin cambiar lib/engine). */
import { useId, useState, type ReactNode } from "react";
import { useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { useApp } from "@/components/providers/AppProvider";
import { Kpi, Panel } from "@/components/ui";
import { OPTS, type EntradasUI } from "@/lib/calculadora";
import { etiquetaSerie } from "@/lib/cargas-usuario/datos";
import { edate, toN, toS, type TipoBono } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import {
  buscarObjetivo,
  fmtValor,
  RESULTADOS,
  resultadosPara,
  VARIABLES,
  variablesPara,
  type ClaveResultado,
  type ClaveVariable,
  type ContextoObjetivo,
  type Flujo,
  type Problema,
  type Respuesta,
} from "@/lib/objetivo/objetivo";
import { pasoAPaso } from "@/lib/objetivo/pasos";
import { BASES, fmtCelda, PLANTILLAS, resolverPlantilla, type ClavePlantilla, type DatosPlantilla, type Fuentes, type ResultadoPlantilla } from "@/lib/objetivo/plantillas";

const HORIZONTES = [30, 90, 365];

/** Contexto del solver: motor, venta de la calculadora y fondeo configurado. */
function useContexto(horizonte: number): ContextoObjetivo & { fuentes: Fuentes } {
  const { motor, calc, datosUsuario, snap } = useApp();
  const { c } = useFondeo();
  const mercado = useMercadoFondeo();
  const hv = calc.hv;
  const fechaVenta = hv?.d || toS(edate(toN(snap.fechaAnalisis), 12));
  const curva = motor.elegirCurvaFrac(toN(snap.fechaAnalisis));
  return {
    motor,
    venta: { fecha: fechaVenta, tasa: hv?.r ?? 10 },
    fondeo: { config: c, mercado, horizonte },
    fuentes: {
      frac: datosUsuario.frac ? etiquetaSerie(datosUsuario.frac) : `${curva.nombre} · ${F.date(curva.fechaBase)}`,
      exp: datosUsuario.exp ? etiquetaSerie(datosUsuario.exp) : `${snap.fuentes.exp?.fuente ?? "Encuesta del BanRep"}`,
      fracUsuario: !!datosUsuario.frac,
    },
  };
}

/* ---------- piezas ---------- */
function TablaFlujos({ flujos, tipo, caption }: { flujos: Flujo[]; tipo: TipoBono; caption: string }) {
  const indice = tipo === "IBR" ? "IBR / FRA" : tipo === "IPC" ? "IPC" : tipo === "UVR" ? "Inflación" : null;
  return (
    <div className="tbl">
      <table>
        <caption className="src">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Pago</th>
            <th scope="col">Días</th>
            {indice && <th scope="col">{indice}</th>}
            <th scope="col">Tasa</th>
            <th scope="col">Cupón</th>
            <th scope="col">Amort.</th>
            <th scope="col">Flujo</th>
            <th scope="col">t</th>
            <th scope="col">VP</th>
          </tr>
        </thead>
        <tbody>
          {flujos.map((f) => (
            <tr key={f.fecha}>
              <td>{F.date(f.fecha)}</td>
              <td>{f.dias}</td>
              {indice && (
                <td title={f.fuente}>
                  {f.indice == null ? "—" : `${nf(3).format(f.indice)} %`}
                  {f.fuente && f.fuente !== "FRAC" ? <span className="src"> · {f.fuente}</span> : null}
                </td>
              )}
              <td>{nf(3).format(f.tasa)} %</td>
              <td>{nf(4).format(f.cupon)}</td>
              <td>{nf(2).format(f.amortizacion)}</td>
              <td>{nf(4).format(f.flujo)}</td>
              <td>{nf(4).format(f.t)}</td>
              <td>{nf(4).format(f.vp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PasoAPasoObjetivo({ p, r }: { p: Problema; r: Respuesta }) {
  const pasos = pasoAPaso(p, r);
  return (
    <div className="obj-pasos">
      <h4>Fórmulas</h4>
      <dl>
        {pasos.formulas.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h4>Ecuación que se resolvió</h4>
      <p className="obj-formula">{pasos.ecuacion}</p>
      <p className="obj-formula">{pasos.sustitucion}</p>
      <p className="src">{pasos.metodo}</p>
      {pasos.notas.map((n) => (
        <p key={n} className="src">
          {n}
        </p>
      ))}
    </div>
  );
}

function Respuestas({ p, r, titular, etiqueta, extras = [], aplicar, children }: { p: Problema; r: Respuesta; titular: ReactNode; etiqueta: string; extras?: [string, string][]; aplicar: () => void; children?: ReactNode }) {
  const [pasos, setPasos] = useState(false);
  const [flujos, setFlujos] = useState(true);
  return (
    <div className="obj-respuesta" aria-live="polite">
      <div className="kpis">
        <Kpi l={etiqueta} v={titular} s={r.verificacion} />
        {extras.map(([l, v]) => (
          <Kpi key={l} l={l} v={v} vStyle={{ fontSize: 20 }} />
        ))}
      </div>
      <div className="obj-acciones">
        <button type="button" className="btn primary sm" onClick={aplicar}>
          Aplicar a la calculadora
        </button>
        <button type="button" className="btn sm ghost" aria-expanded={pasos} onClick={() => setPasos(!pasos)}>
          {pasos ? "Ocultar paso a paso" : "Ver paso a paso"}
        </button>
        <button type="button" className="btn sm ghost" aria-expanded={flujos} onClick={() => setFlujos(!flujos)}>
          {flujos ? "Ocultar flujos" : "Ver flujos"}
        </button>
      </div>
      {children}
      {pasos && <PasoAPasoObjetivo p={p} r={r} />}
      {flujos && <TablaFlujos flujos={r.flujos} tipo={p.entradas.tipo as TipoBono} caption="Flujos proyectados con la respuesta (por 100 de nominal)" />}
    </div>
  );
}

/* ---------- Buscar objetivo general ---------- */
function General() {
  const { calc, setCalc, toast } = useApp();
  const id = useId();
  const tipo = calc.type;
  const entradas = calc.inputs[tipo];
  const resultados = resultadosPara(tipo);
  const variables = variablesPara(tipo);
  const [resultado, setResultado] = useState<ClaveResultado>("tir");
  const [variable, setVariable] = useState<ClaveVariable>(variables[0]);
  const [objetivo, setObjetivo] = useState("13");
  const [aLaPar, setALaPar] = useState(false);
  const [fra, setFra] = useState(true);
  const [horizonte, setHorizonte] = useState(90);
  const [pedido, setPedido] = useState<Problema | null>(null);
  const [respuesta, setRespuesta] = useState<ReturnType<typeof buscarObjetivo> | null>(null);
  const ctx = useContexto(horizonte);

  const res = resultados.includes(resultado) ? resultado : "tir";
  const vari = variables.includes(variable) ? variable : variables[0];
  const conFra = tipo === "IBR" && entradas.metodologia === "Curva FRAC" && aLaPar;
  const R = RESULTADOS[res];

  // Se resuelve al pulsar «Buscar» (no en cada tecla).
  const buscar = () => {
    const p: Problema = { entradas, resultado: res, objetivo: Number(String(objetivo).replace(",", ".")), variable: vari, aLaPar, primerPeriodoFRA: conFra && fra };
    setPedido(p);
    setRespuesta(buscarObjetivo(ctx, p));
  };

  const aplicar = (r: Respuesta) => {
    setCalc((c) => ({ ...c, inputs: { ...c.inputs, [tipo]: { ...c.inputs[tipo], ...r.cambios } as EntradasUI } }));
    toast("Valor aplicado a la calculadora");
  };

  return (
    <Panel titulo="Buscar objetivo" src={`Título ${tipo} de la calculadora · Brent, tolerancia 1e-8`}>
      <form
        className="obj-form"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <p className="obj-frase">
          <label htmlFor={`${id}-res`}>Quiero que</label>
          <select id={`${id}-res`} value={res} onChange={(e) => setResultado(e.target.value as ClaveResultado)}>
            {resultados.map((k) => (
              <option key={k} value={k}>
                {RESULTADOS[k].nombre}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-obj`}>sea igual a</label>
          <span className="obj-valor">
            <input id={`${id}-obj`} inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
            <span className="src">{R.unidad === "$" ? "pesos" : "%"}</span>
          </span>
          <label htmlFor={`${id}-var`}>cambiando</label>
          <select id={`${id}-var`} value={vari} onChange={(e) => setVariable(e.target.value as ClaveVariable)}>
            {variables.map((k) => (
              <option key={k} value={k}>
                {VARIABLES[k].nombre}
              </option>
            ))}
          </select>
        </p>
        {(res === "carry" || res === "roe") && (
          <p className="obj-frase">
            <label htmlFor={`${id}-hor`}>Horizonte</label>
            <select id={`${id}-hor`} value={horizonte} onChange={(e) => setHorizonte(+e.target.value)}>
              {HORIZONTES.map((h) => (
                <option key={h} value={h}>
                  {h} días
                </option>
              ))}
            </select>
            <span className="src">Con el fondeo de «Carry y fondeo».</span>
          </p>
        )}
        {res === "rentVenta" && <p className="src">Venta el {F.date(ctx.venta!.fecha)} a {nf(2).format(ctx.venta!.tasa)} % (se cambian en «Venta y P&G»).</p>}
        <label className="obj-check">
          <input type="checkbox" checked={aLaPar} onChange={(e) => setALaPar(e.target.checked)} />
          Comprar a la par al emitir (precio 100, emisión = fecha de valoración)
        </label>
        {conFra && (
          <label className="obj-check">
            <input type="checkbox" checked={fra} onChange={(e) => setFra(e.target.checked)} />
            Proyectar el primer periodo con la FRA (convención de clase; el motor usa el IBR publicado)
          </label>
        )}
        <div>
          <button type="submit" className="btn primary sm">
            Buscar
          </button>
        </div>
      </form>
      {respuesta && !respuesta.ok && (
        <p className="obj-error" role="alert">
          {respuesta.mensaje}
        </p>
      )}
      {respuesta?.ok && pedido && (
        <Respuestas
          p={pedido}
          r={respuesta}
          etiqueta={VARIABLES[pedido.variable].nombre}
          titular={fmtValor(respuesta.x, VARIABLES[pedido.variable].unidad, VARIABLES[pedido.variable].unidad === "$" ? 0 : 4)}
          aplicar={() => aplicar(respuesta)}
        />
      )}
    </Panel>
  );
}

/* ---------- Preguntas rápidas ---------- */
const sumarMeses = (f: string, m: number) => toS(edate(toN(f), m));

function Plantilla({ clave, alCerrar }: { clave: ClavePlantilla; alCerrar: () => void }) {
  const { calc, setCalc, defaults, snap, toast } = useApp();
  const id = useId();
  const ctx = useContexto(90);
  const fecha0 = snap.fechaAnalisis;
  const [d, setD] = useState<DatosPlantilla>({
    fecha: fecha0,
    vencimiento: sumarMeses(fecha0, 18),
    frecuencia: "Trimestral",
    base: clave === "ipcSpread" ? "365/365" : "30/360",
    modalidad: "Inicio (Previo)",
    objetivo: clave === "nominalGiro" ? 1e9 : 13,
    tipo: "IBR",
    spread: 1.5,
    convencionClase: true,
  });
  const [res, setRes] = useState<ResultadoPlantilla | null>(null);
  const fijar = (k: keyof DatosPlantilla, v: string | number | boolean) => setD((x) => ({ ...x, [k]: v }));
  const titulo = calc.inputs[calc.type];
  const usaTitulo = clave === "precioMaximo" || clave === "nominalGiro";
  const esIPC = clave === "ipcSpread" || (clave === "tasaFija" && d.tipo === "IPC");
  const esIBR = clave === "ibrSpread" || (clave === "tasaFija" && d.tipo === "IBR");

  const resolver = () => setRes(resolverPlantilla(clave, ctx, defaults as unknown as Record<string, EntradasUI>, { ...d, titulo }, ctx.fuentes));

  const aplicar = () => {
    if (!res?.respuesta.ok) return;
    const r = res.respuesta;
    const t = res.problema.entradas.tipo as TipoBono;
    const nuevas = { ...res.problema.entradas, ...r.cambios } as EntradasUI;
    setCalc((c) => ({ ...c, type: t, inputs: { ...c.inputs, [t]: usaTitulo ? ({ ...c.inputs[t], ...r.cambios } as EntradasUI) : nuevas } }));
    toast(usaTitulo ? "Valor aplicado a la calculadora" : `Título ${t} con la respuesta cargado en la calculadora`);
  };

  const num = (k: keyof DatosPlantilla, etiqueta: string, unidad: string) => (
    <div className="f">
      <label htmlFor={`${id}-${k}`}>{etiqueta}</label>
      <span className="obj-valor">
        <input id={`${id}-${k}`} inputMode="decimal" value={String(d[k] ?? "")} onChange={(e) => fijar(k, Number(e.target.value.replace(",", ".")))} />
        <span className="src">{unidad}</span>
      </span>
    </div>
  );
  const fechaCampo = (k: "fecha" | "vencimiento", etiqueta: string) => (
    <div className="f">
      <label htmlFor={`${id}-${k}`}>{etiqueta}</label>
      <input id={`${id}-${k}`} type="date" value={d[k]} onChange={(e) => fijar(k, e.target.value)} />
    </div>
  );
  const sel = (k: "frecuencia" | "base" | "modalidad" | "tipo", etiqueta: string, opciones: readonly string[]) => (
    <div className="f">
      <label htmlFor={`${id}-${k}`}>{etiqueta}</label>
      <select id={`${id}-${k}`} value={String(d[k])} onChange={(e) => fijar(k, e.target.value)}>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
  const pregunta = PLANTILLAS.find((x) => x.clave === clave)!;

  return (
    <div className="obj-plantilla">
      <div className="obj-plantilla-cab">
        <h4>{pregunta.pregunta}</h4>
        <button type="button" className="btn sm ghost" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
      <p className="src">{pregunta.ayuda}</p>
      <form
        className="obj-campos"
        onSubmit={(e) => {
          e.preventDefault();
          resolver();
        }}
      >
        {clave === "tasaFija" && sel("tipo", "Título", ["IBR", "IPC"])}
        {clave === "tasaFija" && num("spread", `Spread sobre ${d.tipo}`, "%")}
        {!usaTitulo && fechaCampo("fecha", "Emisión y compra (a la par)")}
        {!usaTitulo && fechaCampo("vencimiento", "Vencimiento")}
        {!usaTitulo && sel("frecuencia", "Frecuencia", OPTS.frecuencia)}
        {!usaTitulo && sel("base", "Base", BASES)}
        {esIPC && sel("modalidad", "Modalidad del IPC", OPTS.modalidad)}
        {clave !== "tasaFija" && num("objetivo", clave === "nominalGiro" ? "Valor de giro" : "Rentabilidad objetivo (E.A.)", clave === "nominalGiro" ? "pesos" : "%")}
        {esIBR && (
          <label className="obj-check w">
            <input type="checkbox" checked={!!d.convencionClase} onChange={(e) => fijar("convencionClase", e.target.checked)} />
            Convención de clase: primer periodo con la FRA y TIR con días reales/365
          </label>
        )}
        {usaTitulo && <p className="src w">Usa el título {calc.type} de la calculadora: {String(titulo.nombre || titulo.vencimiento)}.</p>}
        <div className="w">
          <button type="submit" className="btn primary sm">
            Resolver
          </button>
        </div>
      </form>

      {res && !res.respuesta.ok && (
        <p className="obj-error" role="alert">
          {res.respuesta.mensaje}
        </p>
      )}
      {res?.respuesta.ok && (
        <Respuestas p={res.problema} r={res.respuesta} titular={res.titular} etiqueta="Respuesta" extras={res.extras} aplicar={aplicar}>
          <div className="obj-convenciones">
            <h4>Convenciones usadas</h4>
            <dl>
              {res.convenciones.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {res.sensibilidad && (
            <div className="tbl">
              <table>
                <caption className="src">Sensibilidad de la respuesta a las convenciones</caption>
                <thead>
                  <tr>
                    <th scope="col">Convención</th>
                    {res.sensibilidad.columnas.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.sensibilidad.filas.map((f) => (
                    <tr key={f.etiqueta} className={f.actual ? "obj-actual" : undefined}>
                      <th scope="row">
                        {f.etiqueta}
                        {f.actual ? <span className="src"> · elegida</span> : null}
                      </th>
                      {f.valores.map((v, k) => (
                        <td key={k}>{fmtCelda(v, res.sensibilidad!.unidad, res.sensibilidad!.columnas[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {res.notas.map((n) => (
            <p key={n} className="src">
              {n}
            </p>
          ))}
        </Respuestas>
      )}
    </div>
  );
}

function PreguntasRapidas() {
  const [abierta, setAbierta] = useState<ClavePlantilla | null>(null);
  return (
    <Panel titulo="Preguntas rápidas del parcial" src="Plantillas con las convenciones a la vista">
      <div className="obj-preguntas">
        {PLANTILLAS.map((p) => (
          <button key={p.clave} type="button" className={`obj-pregunta${abierta === p.clave ? " on" : ""}`} aria-expanded={abierta === p.clave} onClick={() => setAbierta(abierta === p.clave ? null : p.clave)}>
            <b>{p.pregunta}</b>
            <span className="src">{p.ayuda}</span>
          </button>
        ))}
      </div>
      {abierta && <Plantilla key={abierta} clave={abierta} alCerrar={() => setAbierta(null)} />}
    </Panel>
  );
}

export function BuscarObjetivo() {
  return (
    <div className="pestana">
      <General />
      <PreguntasRapidas />
    </div>
  );
}
