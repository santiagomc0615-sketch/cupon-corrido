"use client";
/* Retorno esperado al horizonte si la curva no se mueve. Visualización: selector de horizonte, cascada
   (causación → roll-down → costo de fondeo → total), curva de ganancia neta acumulada del día 0 al 365
   y tabla con % sobre la posición y sobre el capital propio. Las cifras son las de
   lib/analisis/retorno-esperado.ts (motor y lib/carry); aquí solo se presentan. */
import { useMemo } from "react";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useFondeo, useMercadoFondeo } from "@/components/fondeo/ControlesFondeo";
import { useApp } from "@/components/providers/AppProvider";
import { fondeoConfigurado } from "@/components/reporte/BotonReporte";
import { Panel } from "@/components/ui";
import { curvaPara, HORIZONTES_DIAS, retornoEsperado, sumarRetornos, type CurvaRef, type HorizonteDias } from "@/lib/analisis/retorno-esperado";
import { diasCurva, pasosCascada, porcentajes, type FilaRetorno, type PasoCascada } from "@/lib/analisis/retorno-vista";
import { montos } from "@/lib/carry/fondeo";
import type { Bono, ResultadoValoracion } from "@/lib/engine";
import { F, nf } from "@/lib/format";
import { costoFondeo } from "@/lib/pyg/desde-motor";
import { textoRent } from "@/lib/pyg/estado";
import { useGuardado } from "@/lib/storage";

interface Fila extends FilaRetorno {
  vence?: boolean;
}

const mill = (v: number) => F.mill(v, 1);
/** Celda de la tabla en millones de pesos (la unidad va en el encabezado). */
const mm = (v: number) => (v < 0 ? "−" : "") + nf(1).format(Math.abs(v) / 1e6);
const pct = (v: number, d = 2) => F.pct(v, d).replace(/^-/, "−");

/** Curvas TES del día (tasa fija y, si está cargada, UVR). */
function useCurvas() {
  const { datosMotor } = useApp();
  return useMemo(() => {
    const tf: CurvaRef = { fecha: datosMotor.curveDate, refs: datosMotor.tes.map((r) => [r[4], r[3]] as [number, number]) };
    const u = datosMotor.curvaUVR;
    const uvr: CurvaRef | null = u ? { fecha: u.fecha, refs: u.tes.map((r) => [r[4], r[3]] as [number, number]) } : null;
    return { tf, uvr };
  }, [datosMotor]);
}

/** Fondeo del panel «Carry y fondeo» (lib/carry): costo del periodo y capital propio. */
function useFondeoRetorno() {
  const { c } = useFondeo();
  const m = useMercadoFondeo();
  const fondeado = fondeoConfigurado() && c.tipo !== "propio";
  // clave: cambia cuando cambia la configuración del fondeo o el mercado (para recalcular)
  const clave = fondeado ? JSON.stringify([c, m.tpm, m.sofr, m.spot, m.ibr?.on]) : "propio";
  return {
    fondeado,
    clave,
    costo: (giro: number) => (d: number) => (fondeado ? costoFondeo(giro, c, m, d) : 0),
    /** Capital propio = giro × haircut con fondeo (montos de lib/carry); el giro sin fondeo. */
    capitalPropio: (giro: number) => (fondeado ? montos(giro, c).capital : giro),
  };
}

/* ---------- cascada ---------- */
const CLASE_PASO: Record<PasoCascada["clave"], string> = { causacion: "cs-caus", roll: "cs-roll", costo: "cs-costo", total: "cs-total" };

function Cascada({ pasos, dias }: { pasos: PasoCascada[]; dias: number }) {
  const niveles = pasos.flatMap((p) => [p.desde, p.hasta]);
  const min = Math.min(0, ...niveles),
    max = Math.max(0, ...niveles);
  const rango = max - min || 1;
  const y = (v: number) => ((v - min) / rango) * 100; // % desde abajo
  const descripcion = pasos.map((p) => `${p.etiqueta} ${mill(p.valor)}`).join(", ");
  return (
    <figure className="cascada" role="img" aria-label={`Retorno esperado a ${dias} días: ${descripcion}.`}>
      <div className="cs-area" style={{ "--cero": `${y(0)}%` } as React.CSSProperties}>
        {pasos.map((p, i) => {
          const abajo = y(Math.min(p.desde, p.hasta));
          const alto = Math.abs(y(p.hasta) - y(p.desde));
          const siguiente = pasos[i + 1];
          return (
            <div key={p.clave} className="cs-col">
              <span className={`cs-barra ${CLASE_PASO[p.clave]}${p.valor < 0 ? " cs-neg" : ""}`} style={{ bottom: `${abajo}%`, height: `max(${alto}%, 2px)` }} />
              <span className="cs-valor" style={{ bottom: `calc(${y(Math.max(p.desde, p.hasta))}% + 6px)` }}>
                {p.valor < 0 ? "−" : p.clave === "total" ? "" : "+"}
                {mill(Math.abs(p.valor)).replace("−", "")}
              </span>
              {/* Conector fino al nivel donde arranca (o termina, en el total) el paso siguiente */}
              {siguiente && <span className="cs-conector" style={{ bottom: `${y(p.hasta)}%` }} />}
              <span className="cs-eje">{p.etiqueta}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* ---------- ganancia acumulada ---------- */
function CurvaAcumulada({ puntos, fondeoActivo }: { puntos: Fila[]; fondeoActivo: boolean }) {
  const serie: PuntoSerie[] = puntos.map((f) => [f.dias, f.total]);
  const marcas: PuntoSerie[] = puntos.filter((f) => [30, 90, 180, 365].includes(f.dias)).map((f) => [f.dias, f.total, `${f.dias} d`]);
  const porDia = new Map(puntos.map((f) => [f.dias, f]));
  return (
    <div className="cs-acum">
      <h3 className="h-sub">Ganancia neta acumulada día a día</h3>
      <Chart
        series={[
          { data: serie, cls: "s-a", area: true },
          { data: marcas, pointsOnly: true, points: "pt-a", labels: true, r: 4 },
        ]}
        xmin={0}
        xmax={365}
        xticks={() => [30, 90, 180, 365]}
        xf={(v) => `${v} d`}
        yf={(v) => F.mill(v, 0)}
        h={200}
        label="Ganancia neta acumulada del día 0 al 365 si la curva no se mueve"
        tip={(x) => {
          const p = nearest(serie, x);
          const f = porDia.get(p[0]);
          if (!f) return null;
          return {
            x: p[0],
            y: p[1],
            content: (
              <>
                Día {f.dias}: <b>{mill(f.total)}</b>
                <br />
                Causación {mill(f.causacion)}
                {f.roll != null ? <> · roll-down {mill(f.roll)}</> : null}
                {fondeoActivo ? <> · fondeo −{mill(f.costoFondeo)}</> : null}
                <br />
                Cupones cobrados {mill(f.cupones)} (incluidos en la causación)
              </>
            ),
          };
        }}
      />
    </div>
  );
}

/* ---------- tabla ---------- */
function Tabla({ filas, valorHoy, capitalPropio, fondeoActivo, sinRoll, activo }: { filas: Fila[]; valorHoy: number; capitalPropio: number; fondeoActivo: boolean; sinRoll: string | null; activo: number }) {
  return (
    <div className="tbl" style={{ maxHeight: "none" }}>
      <table className="retorno-tabla">
        <caption className="src">Cifras en millones de pesos</caption>
        <thead>
          <tr>
            <th>Horizonte</th>
            <th className="col-info">
              Cupones<span className="sr-only"> (informativo, incluido en la causación)</span>
            </th>
            <th>Causación</th>
            <th>Roll-down</th>
            <th>Costo de fondeo</th>
            <th>Total</th>
            <th>% de la posición</th>
            <th>% sobre capital propio</th>
            <th>Anualizado (E.A.)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const p = porcentajes(f.total, valorHoy, capitalPropio, f.dias);
            return (
              <tr key={f.dias} className={f.dias === activo ? "fila-activa" : undefined}>
                <td>
                  {f.dias} días{f.vence ? <span className="src"> · vence</span> : null}
                </td>
                <td className="col-info">{mm(f.cupones)}</td>
                <td>{mm(f.causacion)}</td>
                <td>{f.roll == null ? <span className="src">{sinRoll ?? "n. a."}</span> : mm(f.roll)}</td>
                <td>{mm(-f.costoFondeo)}</td>
                <td className={f.total >= 0 ? "v-pos" : "v-neg"}>{mm(f.total)}</td>
                <td>{pct(p.posicion)}</td>
                <td>{fondeoActivo ? <b>{pct(p.capitalPropio)}</b> : <span className="src">= posición</span>}</td>
                <td>
                  {textoRent(p.anualPosicion)}
                  {fondeoActivo ? <span className="src cs-anual-cp">{textoRent(p.anualCapitalPropio)} cap. propio</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- vista común ---------- */
function VistaRetorno({
  filas,
  puntos,
  valorHoy,
  capitalPropio,
  fondeoActivo,
  sinRoll,
  sujeto,
  nota,
}: {
  filas: Fila[];
  puntos: Fila[];
  valorHoy: number;
  capitalPropio: number;
  fondeoActivo: boolean;
  sinRoll: string | null;
  sujeto: string;
  nota: string;
}) {
  const [h, setH] = useGuardado<HorizonteDias>("retornoHorizonte", 365);
  const fila = filas.find((f) => f.dias === h) ?? filas[filas.length - 1];
  if (!fila) return <p className="alert">No se pudo calcular el retorno esperado.</p>;
  const p = porcentajes(fila.total, valorHoy, capitalPropio, fila.dias);
  const pasos = pasosCascada(fila, fondeoActivo);
  const gana = fila.total >= 0;
  return (
    <div className="retorno">
      <div className="cs-cab">
        <p className="retorno-frase">
          Si la curva no se mueve, en {nf(0).format(fila.dias)} días {sujeto} {gana ? "ganas" : "pierdes"} <b className={gana ? "v-pos" : "v-neg"}>{mill(Math.abs(fila.total))}</b>:{" "}
          {fondeoActivo ? (
            <>
              <b>{pct(Math.abs(p.capitalPropio))}</b> sobre tu capital propio ({pct(Math.abs(p.posicion))} sobre el valor de la posición).
            </>
          ) : (
            <>
              <b>{pct(Math.abs(p.posicion))}</b> sobre el valor de la posición.
            </>
          )}
        </p>
        <div className="seg" role="group" aria-label="Horizonte">
          {HORIZONTES_DIAS.map((d) => (
            <button key={d} type="button" aria-pressed={h === d} onClick={() => setH(d)}>
              {d} días
            </button>
          ))}
        </div>
      </div>
      <Cascada pasos={pasos} dias={fila.dias} />
      <div className="legend">
        <span>
          <i className="cs-l-caus" />
          Causación (cupones y precio a tasa constante)
        </span>
        <span>
          <i className="cs-l-roll" />
          Roll-down
        </span>
        {fondeoActivo && (
          <span>
            <i className="cs-l-costo" />
            Costo de fondeo
          </span>
        )}
        <span>
          <i className="cs-l-total" />
          Total
        </span>
      </div>
      <CurvaAcumulada puntos={puntos} fondeoActivo={fondeoActivo} />
      <Tabla filas={filas} valorHoy={valorHoy} capitalPropio={capitalPropio} fondeoActivo={fondeoActivo} sinRoll={sinRoll} activo={fila.dias} />
      <p className="src">
        Cupones: dato informativo, ya incluido en la causación.{" "}
        {fondeoActivo
          ? `Capital propio = valor de la posición × haircut (${pct(capitalPropio / valorHoy, 0)}), igual que el ROE de «Carry y fondeo». Ese ROE capitaliza la causación a la TIR (como si los cupones se reinvirtieran) y no incluye roll-down; aquí los cupones no se reinvierten y sí se suma el roll-down. Sin cupones en el periodo (p. ej. a 30 días) coinciden, salvo el roll-down. `
          : ""}
        {nota}
      </p>
    </div>
  );
}

const NOTA =
  "Si la curva no se mueve. Causación: cupones del periodo + cambio de precio a la misma tasa de hoy. Roll-down: el título rueda a un plazo más corto; tasa en el horizonte = TIR de la curva TES al plazo restante + el spread actual del título. Costo de fondeo: el configurado en «Carry y fondeo» (lib/carry). Todas las valoraciones las hace el motor; sin reinversión de cupones.";

const aFila = (r: ReturnType<typeof retornoEsperado>, dias: number): Fila =>
  "error" in r ? { dias, cupones: 0, causacion: 0, roll: null, costoFondeo: 0, total: 0 } : { dias: r.dias, cupones: r.cupones, causacion: r.causacion, roll: r.roll, costoFondeo: r.costoFondeo, total: r.total, vence: r.vence };
const CERO: Fila = { dias: 0, cupones: 0, causacion: 0, roll: null, costoFondeo: 0, total: 0 };

/** Calculadora: el título abierto. */
export function RetornoTitulo({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  const { motor, datosMotor } = useApp();
  const curvas = useCurvas();
  const { fondeado, clave, costo, capitalPropio } = useFondeoRetorno();
  const curva = curvaPara(b.tipo, curvas.tf, curvas.uvr);
  const { filas, puntos } = useMemo(() => {
    const calc = (d: number) => aFila(retornoEsperado(motor, b, o, d, curva, costo(o.giro)), d);
    const filas = HORIZONTES_DIAS.map(calc);
    // la curva llega hasta el vencimiento si el título vence antes de 365 días
    const fin = Math.min(365, Math.max(0, filas[filas.length - 1].dias));
    const puntos = diasCurva(5, fin).map((d) => (d === 0 ? CERO : calc(d)));
    return { filas, puntos };
    // la función de costo se rehace en cada render; la clave refleja su configuración
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor, b, o, curva, clave]);
  const sinRoll = b.tipo === "IBR" || b.tipo === "IPC" ? "no aplica" : b.tipo === "UVR" && !curva ? "sin curva UVR" : null;
  return (
    <Panel titulo="Retorno esperado al horizonte" src={`Curva TES ${F.date(datosMotor.curveDate)} · ${fondeado ? "con el fondeo configurado" : "con capital propio"}`}>
      <VistaRetorno
        filas={filas}
        puntos={puntos}
        valorHoy={o.giro}
        capitalPropio={capitalPropio(o.giro)}
        fondeoActivo={fondeado}
        sinRoll={sinRoll}
        sujeto="con este título"
        nota={
          NOTA +
          (sinRoll === "no aplica" ? " IBR e IPC: el cupón se ajusta al índice y no hay curva de spreads, así que no hay roll-down." : "") +
          (sinRoll === "sin curva UVR" ? " UVR: cargue la curva TES UVR en «Cargar datos» para calcular su roll-down." : "")
        }
      />
    </Panel>
  );
}

/** Portafolio: totales por horizonte (y por día para la curva) y el detalle por posición. */
function useRetornosPortafolio() {
  const { motor, pfValorado } = useApp();
  const curvas = useCurvas();
  const { fondeado, clave, costo, capitalPropio } = useFondeoRetorno();
  const giro = pfValorado.reduce((s, x) => s + x.o.giro, 0);
  return useMemo(() => {
    const curvaDe = (x: (typeof pfValorado)[number]) => curvaPara(x.b.tipo, curvas.tf, curvas.uvr);
    const filas = pfValorado.map((x) => HORIZONTES_DIAS.map((d) => retornoEsperado(motor, x.b, x.o, d, curvaDe(x), costo(x.o.giro))));
    const total = sumarRetornos(filas).map((t) => ({ dias: t.dias, cupones: t.cupones, causacion: t.causacion, roll: t.roll, costoFondeo: t.costoFondeo, total: t.total }));
    // Curva diaria: suma de las posiciones en cada día (las que vencen antes se quedan en su vencimiento)
    const puntos: Fila[] = diasCurva(5, 365).map((d) => {
      if (d === 0) return CERO;
      const rs = pfValorado.map((x) => retornoEsperado(motor, x.b, x.o, d, curvaDe(x), costo(x.o.giro)));
      const ok = rs.filter((r): r is Exclude<typeof r, { error: string }> => !("error" in r));
      const s = (k: (r: (typeof ok)[number]) => number) => ok.reduce((a, r) => a + k(r), 0);
      return { dias: d, cupones: s((r) => r.cupones), causacion: s((r) => r.causacion), roll: s((r) => r.roll ?? 0), costoFondeo: s((r) => r.costoFondeo), total: s((r) => r.total) };
    });
    return { filas, total, puntos, fondeado, giro, capital: capitalPropio(giro) };
    // la función de costo se rehace en cada render; la clave refleja su configuración
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor, pfValorado, curvas, clave]);
}

export function RetornoPortafolio() {
  const { datosMotor } = useApp();
  const { total, puntos, fondeado, giro, capital } = useRetornosPortafolio();
  return (
    <Panel titulo="Retorno esperado al horizonte" src={`Curva TES ${F.date(datosMotor.curveDate)} · ${fondeado ? "con el fondeo configurado" : "con capital propio"}`}>
      <VistaRetorno
        filas={total}
        puntos={puntos}
        valorHoy={giro}
        capitalPropio={capital}
        fondeoActivo={fondeado}
        sinRoll={null}
        sujeto="con el portafolio"
        nota={NOTA + " El roll-down se calcula en los títulos de tasa fija (y UVR si hay curva UVR cargada)."}
      />
    </Panel>
  );
}

export function RetornoPosiciones() {
  const { pfValorado } = useApp();
  const { filas } = useRetornosPortafolio();
  const i = HORIZONTES_DIAS.length - 1;
  return (
    <Panel titulo="Retorno esperado por posición" src="Horizonte de 365 días · si la curva no se mueve">
      <div className="tbl" style={{ maxHeight: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Hasta</th>
              <th>Causación</th>
              <th>Roll-down</th>
              <th>Costo de fondeo</th>
              <th>Total</th>
              <th>Anualizado</th>
            </tr>
          </thead>
          <tbody>
            {pfValorado.map((x, k) => {
              const r = filas[k]?.[i];
              return (
                <tr key={(x.p as { id: string }).id}>
                  <td className="t">
                    {String((x.p as { inputs: { nombre: string } }).inputs.nombre)} <span className="tag">{x.b.tipo}</span>
                  </td>
                  {r && !("error" in r) ? (
                    <>
                      <td>
                        {F.date(r.fecha)}
                        {r.vence && <span className="src"> vence</span>}
                      </td>
                      <td>{mill(r.causacion)}</td>
                      <td>{r.roll == null ? <span className="src">n. a.</span> : mill(r.roll)}</td>
                      <td>{r.costoFondeo ? "−" + mill(r.costoFondeo) : mill(0)}</td>
                      <td className={r.total >= 0 ? "v-pos" : "v-neg"}>{mill(r.total)}</td>
                      <td>{F.pct(r.anual, 2)}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="t src">
                      {r && "error" in r ? r.error : "Sin cálculo"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
