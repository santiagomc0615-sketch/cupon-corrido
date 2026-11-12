"use client";
/* Vista cliente: ganancia, próximo cupón, pagos, colchón y comparación con un CDT, en grande.
   Recibe el resumen ya calculado (lib/cliente.ts). */
import { useApp } from "@/components/providers/AppProvider";
import type { ComparacionCDT, ResumenCliente } from "@/lib/cliente";
import { F, nf } from "@/lib/format";
import { useGuardado } from "@/lib/storage";
import { Contador } from "./Contador";

const pesos = (v: number) => "$ " + nf(0).format(Math.round(v));
const millones = (v: number) => F.mill(v, 1);

export function VistaCliente({
  resumen,
  titulo,
  comparar,
}: {
  resumen: ResumenCliente;
  titulo: string;
  comparar: (tCDT: number) => ComparacionCDT;
}) {
  const { snap } = useApp();
  const [tasaPropia, setTasaPropia] = useGuardado<number | null>("tasaCDT", null);
  const dtf = snap.dtf ?? null;
  const tasaCDT = tasaPropia ?? dtf?.valor ?? null;
  const cdt = tasaCDT != null ? comparar(tasaCDT) : null;
  const r = resumen;
  const pc = r.proximo;
  const max = Math.max(...r.pagos.map((p) => p.cop), 1);

  return (
    <section className="cliente" aria-label={`Vista cliente: ${titulo}`}>
      <header className="cliente-cab">
        <span className="eyebrow">Vista cliente</span>
        <h2>{titulo}</h2>
        <p className="src">
          Invertido {millones(r.giro)} a una TIR de {F.pct(r.tir, 2)} E.A. · cifras en pesos, con capital propio
        </p>
      </header>

      <div className="cliente-grid">
        <article className="tarjeta tarjeta-heroe">
          <h3>Ganancia al año</h3>
          <Contador className="cifra-heroe" valor={r.gananciaAnual} formato={millones} />
          <p>
            <Contador className="cifra-sec" valor={r.gananciaDiaria} formato={pesos} /> <span>cada día</span>
          </p>
        </article>

        {pc && (
          <article className="tarjeta">
            <h3>Próximo cupón</h3>
            <Contador className="cifra" valor={pc.cop} formato={millones} />
            <p>
              {F.date(pc.fecha)} · faltan <b>{nf(0).format(pc.dias)} días</b> · {F.n(pc.pct, 3)} %{pc.titulo ? ` · ${pc.titulo}` : ""}
            </p>
            <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pc.progreso * 100)} aria-label="Cupón causado del periodo">
              <span style={{ transform: `scaleX(${pc.progreso})` }} />
            </div>
            <p className="src">
              Causado {F.mill(pc.causadoCop, 1)} de {F.mill(pc.cop, 1)} ({nf(0).format(pc.progreso * 100)} % · {pc.diasCorridos} de {pc.diasPeriodo} días)
            </p>
          </article>
        )}

        <article className="tarjeta">
          <h3>Colchón</h3>
          <Contador className="cifra" valor={r.colchonPb} formato={(v) => nf(0).format(v) + " pb"} />
          <p>
            Las tasas pueden subir hasta <b>{nf(0).format(r.colchonPb)} pb</b> en un año antes de perder plata.
          </p>
        </article>

        <article className="tarjeta tarjeta-cdt">
          <h3>Frente a un CDT al mismo plazo</h3>
          {cdt ? (
            <>
              <Contador className="cifra" valor={cdt.diferencia} formato={(v) => (v >= 0 ? "+" : "−") + millones(Math.abs(v))} />
              <p>
                {cdt.ganaBono ? "Más que" : "Menos que"} un CDT en {nf(0).format(cdt.plazoDias)} días: {millones(cdt.bono)} vs. {millones(cdt.cdt)}
              </p>
            </>
          ) : (
            <p>Ingrese la tasa del CDT para comparar.</p>
          )}
          <div className="f cdt-tasa">
            <label htmlFor="tasa-cdt">Tasa del CDT (E.A.)</label>
            <div className="u">
              <input
                id="tasa-cdt"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={tasaCDT == null ? "" : +(tasaCDT * 100).toFixed(4)}
                onChange={(e) => setTasaPropia(e.target.value === "" ? null : +e.target.value / 100)}
                style={{ paddingRight: 26 }}
              />
              <span>%</span>
            </div>
            <span className="src">
              {tasaPropia == null ? (
                dtf ? (
                  <>DTF (CDT 90 días) · BanRep · {F.date(dtf.fecha)}</>
                ) : (
                  "Sin DTF del día: ingrésela"
                )
              ) : (
                <>
                  Tasa propia ·{" "}
                  <button type="button" className="enlace" onClick={() => setTasaPropia(null)}>
                    usar la DTF del día
                  </button>
                </>
              )}
            </span>
          </div>
        </article>
      </div>

      {r.pagos.length > 0 && (
        <article className="tarjeta tarjeta-pagos">
          <div className="pagos-cab">
            <h3>Lo que va a recibir</h3>
            <p>
              <Contador className="cifra-sec" valor={r.totalPagos} formato={millones} /> en {r.pagos.length} pagos
            </p>
          </div>
          <ol className="linea-tiempo">
            {r.pagos.map((p, i) => (
              <li key={p.fecha} style={{ "--i": Math.min(i, 12) } as React.CSSProperties} title={p.titulos?.join(", ")}>
                <span className="lt-barra" style={{ height: `${Math.max(6, (p.cop / max) * 100)}%` }} aria-hidden="true" />
                <span className="lt-monto">{millones(p.cop)}</span>
                <span className="lt-fecha">{F.date(p.fecha)}</span>
              </li>
            ))}
          </ol>
        </article>
      )}
    </section>
  );
}
