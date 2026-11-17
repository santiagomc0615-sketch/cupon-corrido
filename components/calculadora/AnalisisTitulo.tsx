"use client";
/* Análisis del título en la calculadora: liquidez, potencial de valorización, atribución desde la
   compra y monitor de spreads. Todo se calcula en lib/analisis (con el motor, sin tocarlo). */
import { useMemo, useState, type ReactNode } from "react";
import { BarrasH } from "@/components/charts/BarrasH";
import { Chart, nearest, type PuntoSerie } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { Panel } from "@/components/ui";
import { atribucionDesdeCompra } from "@/lib/analisis/atribucion";
import { nombreTasa, tasaDe, tasaVentaDe } from "@/lib/analisis/comunes";
import { esReferenciaTES, semaforoLiquidez, UMBRALES } from "@/lib/analisis/liquidez";
import { evaluarSpread, leerHistoriaCSV, spreadActual, type HistoriaSpread } from "@/lib/analisis/spreads";
import { potencialValorizacion } from "@/lib/analisis/valorizacion";
import { toN, toS, type Bono, type ResultadoValoracion } from "@/lib/engine";
import { F, nf } from "@/lib/format";

/** Campo numérico en % que guarda la fracción. */
function CampoPct({ id, etiqueta, valor, onCambio, sufijo = "%", factor = 100, paso = "0.01" }: { id: string; etiqueta: ReactNode; valor: number | null; onCambio: (v: number | null) => void; sufijo?: string; factor?: number; paso?: string }) {
  return (
    <div className="f">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="u">
        <input
          id={id}
          type="number"
          step={paso}
          inputMode="decimal"
          value={valor == null ? "" : +(valor * factor).toFixed(6)}
          onChange={(e) => onCambio(e.target.value === "" ? null : +e.target.value / factor)}
          style={{ paddingRight: 12 + sufijo.length * 7.5 }}
        />
        <span>{sufijo}</span>
      </div>
    </div>
  );
}

const LUZ: Record<string, string> = { verde: "pos", amarillo: "warn", rojo: "neg" };

export function AnalisisTitulo({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  return (
    <section className="analisis" aria-label="Análisis del título">
      <h2 className="h-sub">Análisis del título</h2>
      <div className="grid-c g2">
        <Liquidez b={b} />
        <Valorizacion b={b} o={o} />
      </div>
      <div className="grid-c g2">
        <Atribucion b={b} />
        <Spreads o={o} />
      </div>
    </section>
  );
}

/* 1 · Semáforo de liquidez */
function Liquidez({ b }: { b: Bono }) {
  const { mk } = useApp();
  const auto = esReferenciaTES(b.tipo, b.vencimiento, mk.tesSorted.map((r) => r[1]));
  const [monto, setMonto] = useState<number | null>(null);
  const [ref, setRef] = useState<boolean | null>(null);
  const esRef = ref ?? auto;
  const r = semaforoLiquidez({ tasaCompra: tasaDe(b), tasaVenta: tasaVentaDe(b), montoEmitido: monto, referenciaTES: esRef });
  return (
    <Panel titulo="Semáforo de liquidez" src="Bid-ask, monto emitido y referencia TES">
      <div className="semaforo">
        <span className={"semaforo-luz " + LUZ[r.color]} aria-hidden="true" />
        <div>
          <b>Liquidez {r.nivel.toLowerCase()}</b>
          <span className="src">Puntaje {nf(2).format(r.puntaje)} de 2</span>
        </div>
      </div>
      <ul className="senales">
        {r.senales.map((s) => (
          <li key={s.nombre}>
            <span className={"dot-luz " + LUZ[s.color]} aria-hidden="true" />
            <b>{s.nombre}</b>
            <span>{s.detalle}</span>
            <span className="sr-only">({s.color})</span>
          </li>
        ))}
      </ul>
      <div className="fondeo-campos" style={{ marginTop: 10 }}>
        <CampoPct id="liq-monto" etiqueta="Monto emitido (opcional)" valor={monto} onCambio={setMonto} sufijo="mil M" factor={1e-9} paso="1" />
        <label className="check">
          <input type="checkbox" checked={esRef} onChange={(e) => setRef(e.target.checked)} /> Es referencia TES
          {auto && ref == null && <span className="src"> (detectado en la curva)</span>}
        </label>
      </div>
      <details className="umbrales">
        <summary>¿Cómo se mide?</summary>
        <p className="src">
          Bid-ask = |tasa de venta − tasa de compra|: verde hasta {UMBRALES.bidAsk.verde} pb (lo típico en un TES de referencia), amarillo hasta{" "}
          {UMBRALES.bidAsk.amarillo} pb (deuda privada de buen emisor), rojo por encima. Monto emitido: verde desde 1 billón, amarillo desde 300 mil
          millones, rojo por debajo. Ser referencia TES suma verde. Cada señal vale 2, 1 o 0 y se promedian: 1,5 o más = alta, 0,75 o más = media.
          Son umbrales académicos de referencia.
        </p>
      </details>
    </Panel>
  );
}

/* 2 · Potencial de valorización */
function Valorizacion({ b, o }: { b: Bono; o: ResultadoValoracion }) {
  const { motor } = useApp();
  const actual = tasaDe(b);
  const [objetivo, setObjetivo] = useState<number | null>(null);
  const obj = objetivo ?? actual - 0.005;
  const v = useMemo(() => potencialValorizacion(motor, b, o, obj), [motor, b, o, obj]);
  return (
    <Panel titulo="Potencial de valorización" src="Precio con la tasa objetivo, hoy (motor)">
      <div className="fondeo-campos">
        <CampoPct id="val-obj" etiqueta={`${nombreTasa(b)} objetivo`} valor={obj} onCambio={setObjetivo} />
      </div>
      {"error" in v ? (
        <p className="alert" role="alert" style={{ marginTop: 10 }}>
          {v.error}
        </p>
      ) : (
        <>
          <div className="kpis k3" style={{ marginTop: 12 }}>
            <div className="kpi">
              <span className="l">Precio objetivo</span>
              <span className="v">{F.n(v.precioObjetivo, 3)} %</span>
              <span className="s">hoy {F.n(v.precioActual, 3)} %</span>
            </div>
            <div className="kpi">
              <span className="l">Ganancia</span>
              <span className="v" style={{ color: `var(--${v.ganancia >= 0 ? "pos" : "neg"})` }}>
                {F.mill(v.ganancia, 1)}
              </span>
              <span className="s">{F.pct(v.gananciaPct, 2)} del giro</span>
            </div>
            <div className="kpi">
              <span className="l">Cambio de tasa</span>
              <span className="v">{F.bp(v.cambioPb)}</span>
              <span className="s">
                de {F.pct(v.tasaActual, 2)} a {F.pct(v.tasaObjetivo, 2)}
              </span>
            </div>
          </div>
          <p className="src" style={{ marginTop: 8 }}>
            Si la tasa {v.cambioPb < 0 ? "baja" : "sube"} {nf(0).format(Math.abs(v.cambioPb))} pb ({nombreTasa(b)}), el giro pasa de {F.mill(v.giroActual, 1)} a{" "}
            {F.mill(v.giroObjetivo, 1)}.
          </p>
        </>
      )}
    </Panel>
  );
}

/* 3 · Atribución desde la compra */
function Atribucion({ b }: { b: Bono }) {
  const { motor, snap } = useApp();
  const hoyDefecto = snap.fechaAnalisis;
  const compraDefecto = b.valoracion < hoyDefecto ? b.valoracion : toS(Math.max(toN(b.emision), toN(hoyDefecto) - 90));
  const [fechaCompra, setFechaCompra] = useState<string | null>(null);
  const [fechaHoy, setFechaHoy] = useState<string | null>(null);
  const [tasaCompra, setTasaCompra] = useState<number | null>(null);
  const [tasaMercado, setTasaMercado] = useState<number | null>(null);
  const p = {
    fechaCompra: fechaCompra ?? compraDefecto,
    fechaHoy: fechaHoy ?? hoyDefecto,
    tasaCompra: tasaCompra ?? tasaDe(b),
    tasaMercado: tasaMercado ?? tasaDe(b),
  };
  const a = useMemo(() => atribucionDesdeCompra(motor, b, p), [motor, b, p.fechaCompra, p.fechaHoy, p.tasaCompra, p.tasaMercado]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel titulo="Resultado desde la compra" src="Causación + valorización + cupones (motor)">
      <div className="fondeo-campos">
        <div className="f">
          <label htmlFor="at-fc">Fecha de compra</label>
          <input id="at-fc" type="date" value={p.fechaCompra} onChange={(e) => setFechaCompra(e.target.value || null)} />
        </div>
        <CampoPct id="at-tc" etiqueta={`${nombreTasa(b)} de compra`} valor={p.tasaCompra} onCambio={setTasaCompra} />
        <div className="f">
          <label htmlFor="at-fh">Fecha de hoy</label>
          <input id="at-fh" type="date" value={p.fechaHoy} onChange={(e) => setFechaHoy(e.target.value || null)} />
        </div>
        <CampoPct id="at-tm" etiqueta={`${nombreTasa(b)} de mercado hoy`} valor={p.tasaMercado} onCambio={setTasaMercado} />
      </div>
      {"error" in a ? (
        <p className="alert" role="alert" style={{ marginTop: 10 }}>
          {a.error}
        </p>
      ) : (
        <>
          <BarrasH
            label="Atribución del resultado desde la compra"
            filas={[
              { etiqueta: "Causación", valor: a.causacion, texto: F.mill(a.causacion, 1), sub: "a la tasa de compra", descripcion: `Causación ${F.mill(a.causacion, 1)}` },
              {
                etiqueta: "Valorización",
                valor: a.valorizacion,
                texto: F.mill(a.valorizacion, 1),
                sub: F.bp((a.tasaMercado - a.tasaCompra) * 1e4) + " de tasa",
                descripcion: `Valorización por cambio de tasa ${F.mill(a.valorizacion, 1)}`,
              },
              { etiqueta: "Total", valor: a.total, texto: F.mill(a.total, 1), sub: `${F.pct(a.rentabilidadEA, 2)} E.A.`, descripcion: `Total ${F.mill(a.total, 1)}` },
            ]}
          />
          <p className="src" style={{ marginTop: 8 }}>
            {a.dias} días · compró por {F.mill(a.giroCompra, 1)}, hoy vale {F.mill(a.giroHoy, 1)} y recibió {a.cupones.length} cupón(es) por{" "}
            {F.mill(a.totalCupones, 1)}
            {a.cupones.length ? ` (${a.cupones.map((c) => F.date(c.fecha)).join(", ")})` : ""}. Causación incluye los cupones recibidos.
          </p>
        </>
      )}
    </Panel>
  );
}

/* 4 · Monitor de spreads */
function Spreads({ o }: { o: ResultadoValoracion }) {
  const actual = spreadActual(o);
  const [historia, setHistoria] = useState<HistoriaSpread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const leer = async (f: File) => {
    setError(null);
    const h = leerHistoriaCSV(await f.text(), actual?.referencia ?? null);
    if ("error" in h) {
      setHistoria(null);
      setError(h.error);
    } else setHistoria(h);
  };
  const pts = historia?.puntos ?? [];
  // Spread actual: el del motor; si el tipo no lo tiene, el último del archivo.
  const hoyPb = actual?.pb ?? pts[pts.length - 1]?.pb ?? null;
  const ev = pts.length && hoyPb != null ? evaluarSpread(pts, hoyPb) : null;
  const serie: PuntoSerie[] = pts.map((p) => [toN(p.fecha), p.pb]);
  return (
    <Panel titulo="Monitor de spreads" src={actual ? actual.descripcion : "Suba la historia con su referencia"}>
      <div className="spread-cab">
        <div>
          <span className="src">Spread actual</span>
          <b className="spread-pb">{hoyPb != null ? `${nf(0).format(hoyPb)} pb` : "—"}</b>
        </div>
        {ev && <span className={"chip " + (ev.etiqueta === "barato" ? "pos" : ev.etiqueta === "caro" ? "neg" : "")}>{ev.etiqueta} · percentil {nf(0).format(ev.percentil)}</span>}
      </div>
      <div className="f" style={{ marginTop: 10 }}>
        <label htmlFor="sp-csv">Historia (CSV: fecha; TIR del título o deuda comparable; TIR de referencia opcional)</label>
        <input id="sp-csv" type="file" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && void leer(e.target.files[0])} />
      </div>
      {error && (
        <p className="alert" role="alert" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
      {ev && (
        <>
          <Chart
            series={[{ data: serie, cls: "s-a", end: "pt-a" }]}
            band={[ev.p25, ev.p75]}
            yf={(v) => nf(0).format(v)}
            xf={(n) => F.mes(toS(n))}
            label="Spread histórico en pb con la franja entre los percentiles 25 y 75"
            h={190}
            tip={(x) => {
              const p = nearest(serie, x);
              return { x: p[0], y: p[1], content: <>{F.date(toS(p[0]))}<br />{nf(1).format(p[1])} pb</> };
            }}
          />
          <p className="src" style={{ marginTop: 6 }}>
            Franja: percentiles 25–75 ({nf(0).format(ev.p25)}–{nf(0).format(ev.p75)} pb) · mediana {nf(0).format(ev.p50)} pb · {pts.length} fechas. Barato: el
            spread actual está en el 25 % más alto de su historia (rinde más de lo usual); caro: en el 25 % más bajo.
            {historia?.avisos.map((a) => " " + a)}
          </p>
        </>
      )}
    </Panel>
  );
}
