"use client";
/* Resumen fijo arriba de los resultados: lo más importante del título de un vistazo.
   Precio sucio (tarjeta héroe), TIR, ganancia del cliente (anual y diaria), próximo cupón y
   colchón en pb. Las cifras vienen del motor (o) y de lib/cliente (resumenTitulo); aquí solo se
   muestran. Cuentan hasta su valor al cambiar un dato (Contador respeta prefers-reduced-motion).
   En modo clase, precio sucio y TIR abren su fórmula paso a paso. */
import type { ReactNode } from "react";
import { Contador } from "@/components/cliente/Contador";
import type { ResumenCliente } from "@/lib/cliente";
import type { ClaveClase } from "@/lib/clase";
import type { ResultadoValoracion } from "@/lib/engine";
import { F, nf } from "@/lib/format";

const pct3 = (v: number) => F.n(v, 3) + " %";
const tasa = (v: number) => F.pct(v, 3);
const millones = (v: number) => F.mill(v, 1);
const pesos = (v: number) => "$ " + nf(0).format(Math.round(v));

function Cifra({
  etiqueta,
  children,
  nota,
  clave,
  clase,
  activa,
  onClave,
  heroe,
}: {
  etiqueta: string;
  children: ReactNode;
  nota?: ReactNode;
  clave?: ClaveClase;
  clase: boolean;
  activa: ClaveClase | null;
  onClave: (k: ClaveClase | null) => void;
  heroe?: boolean;
}) {
  const cuerpo = (
    <>
      <span className="r-etq">
        {etiqueta}
        {clase && clave ? <span className="r-formula"> · ver fórmula</span> : null}
      </span>
      <span className="r-valor">{children}</span>
      {nota ? <span className="r-nota">{nota}</span> : null}
    </>
  );
  const cls = `r-cifra${heroe ? " r-heroe" : ""}`;
  return clase && clave ? (
    <button type="button" className={cls} aria-pressed={activa === clave} onClick={() => onClave(activa === clave ? null : clave)}>
      {cuerpo}
    </button>
  ) : (
    <div className={cls}>{cuerpo}</div>
  );
}

export function ResumenTitulo({
  o,
  r,
  clase,
  activa,
  onClave,
}: {
  o: ResultadoValoracion;
  r: ResumenCliente;
  clase: boolean;
  activa: ClaveClase | null;
  onClave: (k: ClaveClase | null) => void;
}) {
  const pc = r.proximo;
  const comun = { clase, activa, onClave };
  return (
    <section className="resumen" aria-label="Resumen del título">
      <Cifra etiqueta="Precio sucio" clave="dirty" heroe {...comun} nota={`Compra · truncado a 3 decimales · limpio ${F.n(o.clean, 3)} %`}>
        <Contador valor={o.dirty} formato={pct3} />
      </Cifra>
      <div className="resumen-apoyo">
        <Cifra
          etiqueta={o.tipo === "UVR" ? "TIR real" : "TIR E.A."}
          clave="irr"
          {...comun}
          nota={o.tipo === "UVR" ? `En pesos ≈ ${F.pct(o.tirPesos, 2)}` : `Nominal ${F.pct(o.nom, 3)}`}
        >
          <Contador valor={o.irr} formato={tasa} />
        </Cifra>
        <Cifra etiqueta="Ganancia del cliente al año" {...comun} nota={<>{pesos(r.gananciaDiaria)} cada día</>}>
          <Contador valor={r.gananciaAnual} formato={millones} />
        </Cifra>
        <Cifra etiqueta="Próximo cupón" {...comun} nota={pc ? `${F.date(pc.fecha)} · faltan ${nf(0).format(pc.dias)} días` : "Sin cupones pendientes"}>
          {pc ? <Contador valor={pc.cop} formato={millones} /> : "—"}
        </Cifra>
        <Cifra etiqueta="Colchón" {...comun} nota="Subida de tasas que aguanta un año sin perder">
          <Contador valor={r.colchonPb} formato={(v) => nf(0).format(v) + " pb"} />
        </Cifra>
      </div>
    </section>
  );
}
