"use client";
/* Tarjeta «Frente a un CDT al mismo plazo» (vista cliente y pestaña Resumen de la calculadora).
   La comparación la calcula lib/cliente; aquí solo se elige la tasa del CDT (DTF del día o propia). */
import { useApp } from "@/components/providers/AppProvider";
import type { ComparacionCDT } from "@/lib/cliente";
import { F, nf } from "@/lib/format";
import { useGuardado } from "@/lib/storage";
import { Contador } from "./Contador";

const millones = (v: number) => F.mill(v, 1);

export function FrenteCDT({ comparar }: { comparar: (tCDT: number) => ComparacionCDT }) {
  const { snap } = useApp();
  const [tasaPropia, setTasaPropia] = useGuardado<number | null>("tasaCDT", null);
  const dtf = snap.dtf ?? null;
  const tasaCDT = tasaPropia ?? dtf?.valor ?? null;
  const cdt = tasaCDT != null ? comparar(tasaCDT) : null;
  return (
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
  );
}
