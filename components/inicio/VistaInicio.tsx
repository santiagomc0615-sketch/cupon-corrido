"use client";
/* Página de inicio: invita a usar la calculadora. Todas las cifras son reales (datos del día y el
   motor con el título de ejemplo); nada se calcula aquí. Las animaciones de scroll son de CSS
   (animation-timeline: view()): sin soporte o con movimiento reducido, todo se ve completo. */
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Guilloche, ROSETA } from "@/components/shell/Guilloche";
import { BRAND } from "@/lib/brand";
import { toEngine } from "@/lib/calculadora";
import { esError, type TipoBono } from "@/lib/engine";
import { PARAMETROS_OFICIALES } from "@/lib/impuestos/parametros";
import { PERFIL_INICIAL } from "@/lib/impuestos/perfil";
import { compararOpciones, NOMBRE_OPCION } from "@/lib/pyg/comparador";
import { entradasDesdeMotor } from "@/lib/pyg/desde-motor";
import { estadoPyG, textoRent } from "@/lib/pyg/estado";
import { F, nf } from "@/lib/format";
import { CifraViva } from "./CifraViva";
import { CurvaHeroe } from "./CurvaHeroe";

const pct = (d: number) => (v: number) => nf(d).format(v * 100) + " %";

/** Luz que sigue al puntero: guarda su posición en variables CSS del elemento (solo con mouse). */
function seguirPuntero(el: HTMLElement, e: React.PointerEvent, x = "--mx", y = "--my") {
  if (e.pointerType !== "mouse") return;
  const r = el.getBoundingClientRect();
  el.style.setProperty(x, `${e.clientX - r.left}px`);
  el.style.setProperty(y, `${e.clientY - r.top}px`);
}

export function VistaInicio() {
  const { snap, mk, motor, defaults, pfValorado, datosMotor } = useApp();
  const tes10 = mk.tes10;
  const ejemplo = motor.price(toEngine(defaults.TF));
  const fuente = (k: "tpm" | "ipc" | "trm" | "ibr") => snap.fuentes[k];

  // Portafolio de ejemplo: peso de cada tipo de título (valor de giro).
  const pesos = (["TF", "IBR", "IPC", "UVR"] as TipoBono[]).map((t) => [t, pfValorado.filter((x) => x.b.tipo === t).reduce((s, x) => s + x.o.giro, 0)] as const);
  const maxPeso = Math.max(...pesos.map((p) => p[1]), 1);

  // Mini demostraciones con cifras reales: P&G del título de ejemplo al vencimiento y comparador a 3 años.
  const pyg = useMemo(() => {
    if (esError(ejemplo)) return null;
    const e = entradasDesdeMotor(motor, toEngine(defaults.TF), ejemplo, { alVencimiento: true }, { ipc: datosMotor.ipc, exp: datosMotor.exp });
    return "error" in e ? null : estadoPyG(e, PERFIL_INICIAL, PARAMETROS_OFICIALES);
  }, [ejemplo, motor, defaults, datosMotor]);
  const cmp = useMemo(
    () =>
      compararOpciones(datosMotor, { monto: 1e8, plazoAnios: 3, fecha: snap.fechaAnalisis, tasaCDT: snap.dtf?.valor ?? 0.1 }, PERFIL_INICIAL, PARAMETROS_OFICIALES)
        .filter((f) => f.pyg)
        .map((f) => [NOMBRE_OPCION[f.opcion], f.pyg!.rentReal ?? -1] as const),
    [datosMotor, snap],
  );
  const maxCmp = Math.max(...cmp.map((c) => Math.abs(c[1])), 0.0001);
  const mejorCmp = cmp.reduce((m, c) => (c[1] > m[1] ? c : m), cmp[0] ?? ["", 0]);

  return (
    <div className="inicio">
      {/* 1 · Héroe */}
      <section className="ini-heroe" aria-labelledby="ini-titulo" onPointerMove={(e) => seguirPuntero(e.currentTarget, e, "--hx", "--hy")}>
        <Guilloche opt={ROSETA} size={900} className="ini-roseta" />
        <div className="ini-heroe-texto">
          <h1 id="ini-titulo">{BRAND.nombre}</h1>
          <p className="ini-frase">Valora, analiza y gestiona renta fija colombiana con datos en vivo.</p>
          <dl className="ini-cifras">
            <div>
              <dt>Tasa de política</dt>
              <dd>
                <CifraViva valor={snap.macro.tpm} formato={pct(2)} />
              </dd>
              <dd className="src">
                {fuente("tpm")?.fuente ?? "BanRep"} · {F.date(snap.macro.tpmFecha)}
              </dd>
            </div>
            <div>
              <dt>Inflación 12 meses</dt>
              <dd>
                <CifraViva valor={mk.ipcLast.annual} formato={pct(2)} retardo={80} />
              </dd>
              <dd className="src">DANE · {F.mes(mk.ipcLast.f)}</dd>
            </div>
            <div>
              <dt>TES 10 años</dt>
              <dd>
                <CifraViva valor={tes10[3]} formato={pct(2)} retardo={160} />
              </dd>
              <dd className="src">
                {tes10[0].replace("TES TF ", "TES ")} · curva {F.date(snap.datos.curveDate)}
              </dd>
            </div>
          </dl>
          <div className="ini-botones">
            <Link className="btn primary btn-grande" href="/calculadora">
              Valorar un bono
            </Link>
            <Link className="btn btn-grande" href="/mercado">
              Ver el mercado
            </Link>
          </div>
        </div>
        <CurvaHeroe tes={mk.tesSorted} fecha={snap.datos.curveDate} />
      </section>

      {/* 2 · Funciones */}
      <section className="ini-seccion" aria-labelledby="ini-funciones">
        <h2 id="ini-funciones" className="ini-h2">
          Todo lo que necesita para operar renta fija
        </h2>
        <div
          className="ini-funciones"
          onPointerMove={(e) => {
            const c = (e.target as HTMLElement).closest<HTMLElement>(".funcion");
            if (c) seguirPuntero(c, e);
          }}
        >
          <Funcion href="/calculadora" titulo="Calculadora" texto="Precio sucio y limpio, TIR, la ganancia del cliente, riesgo y flujos de TES, IBR, IPC y UVR.">
            <div className="demo demo-calc" aria-hidden="true">
              <span className="dc-fila">
                <i>Cupón</i>
                <b>{F.pct(Number(defaults.TF.cupon) / 100, 2)}</b>
              </span>
              <span className="dc-fila">
                <i>TIR compra</i>
                <b>{F.pct(Number(defaults.TF.tasaCompra) / 100, 2)}</b>
              </span>
              <span className="dc-resultado">
                <i>Precio sucio</i>
                <b>{esError(ejemplo) ? "—" : F.n(ejemplo.dirty, 3) + " %"}</b>
              </span>
            </div>
          </Funcion>
          <Funcion href="/portafolio" titulo="Portafolio" texto="Valor, riesgo, flujos por año, fondeo, P&G y escenarios del BanRep.">
            <div className="demo demo-barras" aria-hidden="true">
              {pesos.map(([t, v], i) => (
                <span key={t} style={{ "--h": Math.max(0.08, v / maxPeso), "--i": i } as React.CSSProperties}>
                  <i />
                  <b>{t}</b>
                </span>
              ))}
            </div>
          </Funcion>
          <Funcion href="/calculadora" titulo="Carry y fondeo" texto="Causación, costo de fondeo en pesos o en dólares, ROE y colchón en pb.">
            <div className="demo demo-carry" aria-hidden="true">
              <span className="dk-barra dk-caus">
                <i>Causación</i>
              </span>
              <span className="dk-barra dk-costo">
                <i>Fondeo</i>
              </span>
              <b className="dk-neto">= carry neto</b>
            </div>
          </Funcion>
          <Funcion href="/calculadora" titulo="Venta y P&G" texto="Estado de resultados al vender o al vencimiento, con impuestos de Colombia e inflación.">
            <div className="demo demo-pyg" aria-hidden="true">
              {pyg ? (
                <>
                  <span style={{ "--i": 0 } as React.CSSProperties}>
                    <i>Bruta</i>
                    <b>{textoRent(pyg.rentNominal)}</b>
                  </span>
                  <span style={{ "--i": 1 } as React.CSSProperties}>
                    <i>Después de impuestos</i>
                    <b>{textoRent(pyg.rentDespues)}</b>
                  </span>
                  <span className="dp-real" style={{ "--i": 2 } as React.CSSProperties}>
                    <i>Real al año</i>
                    <b>{textoRent(pyg.rentReal)}</b>
                  </span>
                </>
              ) : null}
            </div>
          </Funcion>
          <Funcion href="/portafolio" titulo="Comparador CDT vs. TES" texto="CDT, TES tasa fija, IBR, IPC y UVR al mismo plazo: ganancia real, riesgo y escenarios.">
            <div className="demo demo-cmp" aria-hidden="true">
              {cmp.map(([n, v], i) => (
                <span key={n} className={n === mejorCmp[0] ? "dcm-mejor" : undefined} style={{ "--w": Math.max(0.06, Math.abs(v) / maxCmp), "--i": i } as React.CSSProperties}>
                  <i>{n}</i>
                  <em />
                </span>
              ))}
            </div>
          </Funcion>
          <Funcion href="/calculadora" titulo="Análisis del título" texto="Semáforo de liquidez, potencial de valorización, resultado desde la compra y spreads.">
            <div className="demo demo-analisis" aria-hidden="true">
              <span className="dan-semaforo">
                <i className="v" />
                <i className="a" />
                <i className="r" />
              </span>
              <span className="dan-filas">
                <span style={{ "--i": 0 } as React.CSSProperties}>Liquidez</span>
                <span style={{ "--i": 1 } as React.CSSProperties}>Potencial</span>
                <span style={{ "--i": 2 } as React.CSSProperties}>Spreads</span>
              </span>
            </div>
          </Funcion>
          <Funcion href="/curva" titulo="Curva TES" texto="Curva cero cupón e inflación implícita por TES UVR frente a la meta y las expectativas.">
            <div className="demo demo-curva" aria-hidden="true">
              <svg viewBox="0 0 120 50">
                <path d="M4 44 C 24 26, 46 18, 70 14 S 104 10, 116 8" pathLength={1} />
              </svg>
            </div>
          </Funcion>
          <Funcion href="/asesor" titulo="Asesor IA" texto="Agente que calcula con el motor: escenarios, alternativas, fondeo, impuestos y comité de inversión. Respuestas generadas por IA.">
            <div className="demo demo-asesor" aria-hidden="true">
              <span className="da-pregunta">¿Cómo va la inflación?</span>
              <span className="da-respuesta">
                <span>Va en {F.pct(mk.ipcLast.annual, 2)} anual…</span>
              </span>
            </div>
          </Funcion>
          <Funcion href="/portafolio" titulo="Reporte PDF" texto="Reporte del título o del portafolio con el P&G, listo para enviar al cliente.">
            <div className="demo demo-pdf" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </Funcion>
          <Funcion href="/noticias" titulo="Noticias y fuentes" texto="Titulares del mercado y el estado de cada serie de datos.">
            <div className="demo demo-noticias" aria-hidden="true">
              <span style={{ "--i": 0 } as React.CSSProperties}>Banco de la República</span>
              <span style={{ "--i": 1 } as React.CSSProperties}>DANE</span>
              <span style={{ "--i": 2 } as React.CSSProperties}>Mercados</span>
            </div>
          </Funcion>
        </div>
      </section>

      {/* 3 · Cómo funciona */}
      <section className="ini-seccion" aria-labelledby="ini-como">
        <h2 id="ini-como" className="ini-h2">
          Cómo funciona
        </h2>
        <ol className="ini-pasos">
          <li>
            <b>Ingresa el título</b>
            <span>Tipo (tasa fija, IBR, IPC o UVR), fechas, cupón y tasa de negociación.</span>
          </li>
          <li>
            <b>Obtén precio, riesgo y ganancia</b>
            <span>Precio, TIR, la ganancia del cliente, riesgo, carry y el P&G con impuestos e inflación.</span>
          </li>
          <li>
            <b>Agrégalo a tu portafolio y consulta al asesor</b>
            <span>Mide el portafolio, compáralo con un CDT, descarga el reporte PDF y pregúntale al asesor IA.</span>
          </li>
        </ol>
      </section>

      {/* 4 · Fuentes */}
      <section className="ini-fuentes" aria-label="Fuentes de datos">
        <span className="chip-dia">Dato del día</span>
        <span>
          <b>Banco de la República</b> · TPM e IBR al {F.date(fuente("ibr")?.hasta || snap.macro.tpmFecha)}
        </span>
        <span>
          <b>DANE</b> · IPC de {F.mes(mk.ipcLast.f)}
        </span>
        <span>
          <b>datos.gov.co</b> · TRM {snap.trm ? "del " + F.date(snap.trm.fecha) : "sin dato"}
        </span>
      </section>

      {/* 5 · Cierre */}
      <section className="ini-cierre" aria-labelledby="ini-cierre-t">
        <h2 id="ini-cierre-t" className="ini-h2">
          Valore su primer bono en un minuto
        </h2>
        <Link className="btn primary btn-enorme" href="/calculadora">
          Empezar ahora
        </Link>
        <p className="src">{BRAND.avisoLegal}</p>
      </section>
    </div>
  );
}

function Funcion({ href, titulo, texto, children, proximamente }: { href?: string; titulo: string; texto: string; children: ReactNode; proximamente?: boolean }) {
  const cuerpo = (
    <>
      {children}
      <span className="fn-titulo">
        {titulo}
        {proximamente ? <span className="chip">Próximamente</span> : <svg className="fn-flecha" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>}
      </span>
      <span className="fn-texto">{texto}</span>
    </>
  );
  return href && !proximamente ? (
    <Link className="funcion" href={href}>
      {cuerpo}
    </Link>
  ) : (
    <div className="funcion funcion-quieta">{cuerpo}</div>
  );
}
