"use client";
/* «Cargar curva FRAC» (calculadora IBR y Curva TES): lee un Excel o CSV en el navegador, valida
   (lib/frac/usuario.ts), muestra una vista previa y, con «Usar esta curva», la guarda en el navegador
   y la elige en la calculadora IBR con la metodología «Curva FRAC». «Volver a la curva por defecto»
   la borra. No hay inicio de sesión: la curva vive en este navegador. */
import { useId, useRef, useState } from "react";
import { Chart, nearest } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { filasCSV, type Celda } from "@/lib/cargas/leer";
import { toN, type TuplaFecha } from "@/lib/engine";
import { F, nf, pctAx } from "@/lib/format";
import { ID_CURVA_USUARIO, leerCurvaFrac, leerCurvaFracHojas, nombreCurvaUsuario, type LecturaCurva } from "@/lib/frac/usuario";

/** Curva como serie del gráfico: x en años desde la fecha de la curva. */
const serie = (d: TuplaFecha[]): [number, number][] => {
  const n0 = toN(d[0][0]);
  return d.map(([f, v]) => [(toN(f) - n0) / 365, v]);
};

function MiniCurva({ datos, etiqueta }: { datos: TuplaFecha[]; etiqueta: string }) {
  const s = serie(datos);
  return (
    <Chart
      series={[{ data: s, cls: "s-a" }]}
      xmin={0}
      yf={pctAx(1)}
      xf={(v) => (Number.isInteger(v) ? nf(0) : nf(1)).format(v) + "a"}
      label={etiqueta}
      h={140}
      tip={(x) => {
        const p = nearest(s, x);
        const i = s.indexOf(p);
        return { x: p[0], y: p[1], content: <>{F.date(datos[Math.max(0, i)][0])} · {F.pct(p[1], 3)}</> };
      }}
    />
  );
}

export function CargarCurvaFrac({ compacto = false }: { compacto?: boolean }) {
  const { curvaUsuario, usarCurvaUsuario, quitarCurvaUsuario, calc, toast } = useApp();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [lectura, setLectura] = useState<LecturaCurva | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const elegida = calc.inputs.IBR?.metodologia === "Curva FRAC" && calc.inputs.IBR?.curvaFrac === ID_CURVA_USUARIO;

  const leer = async (f: File) => {
    setLeyendo(true);
    setLectura(null);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const hojas = await readXlsxFile(f);
        setLectura(leerCurvaFracHojas(hojas.map((h) => ({ hoja: h.sheet, filas: h.data as Celda[][] })), f.name));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const { filas, comaDecimal } = filasCSV(await f.text());
        setLectura(leerCurvaFrac(filas, f.name, undefined, comaDecimal));
      } else setLectura({ ok: false, errores: ["Formato no soportado: use un Excel (.xlsx) o un CSV."] });
    } catch {
      setLectura({ ok: false, errores: ["No se pudo leer el archivo. Revise que sea un Excel (.xlsx) o un CSV válido."] });
    } finally {
      setLeyendo(false);
    }
  };

  const usar = () => {
    if (!lectura?.ok) return;
    usarCurvaUsuario(lectura.curva);
    setLectura(null);
    toast(`${nombreCurvaUsuario(lectura.curva)} en uso`);
  };

  return (
    <div className={`frac-usuario${compacto ? " compacto" : ""}`}>
      <div className="frac-usuario-barra">
        <input
          ref={entrada}
          id={id}
          type="file"
          accept=".xlsx,.csv,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void leer(f);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn sm" onClick={() => entrada.current?.click()} disabled={leyendo} aria-describedby={`${id}-ayuda`}>
          {leyendo ? "Leyendo…" : "Cargar curva FRAC"}
        </button>
        {curvaUsuario && (
          <button type="button" className="btn sm ghost" onClick={quitarCurvaUsuario}>
            Volver a la curva por defecto
          </button>
        )}
        <span className="src" id={`${id}-ayuda`}>
          Excel o CSV con dos columnas: fecha y tasa (IBR forward, en % o decimal).
        </span>
      </div>

      {curvaUsuario && !lectura && (
        <p className="frac-usuario-estado" role="status">
          <span className="chip">
            <span className="dot" />
            {elegida ? "En uso" : "Guardada"}
          </span>
          <span>
            {nombreCurvaUsuario(curvaUsuario)}
            <span className="src">
              {" "}
              · {curvaUsuario.datos.length} nodos · {curvaUsuario.archivo}
              {elegida ? "" : " · elíjala en la calculadora IBR con la metodología «Curva FRAC»"}
            </span>
          </span>
        </p>
      )}

      {!compacto && curvaUsuario && !lectura && <MiniCurva datos={curvaUsuario.datos} etiqueta={nombreCurvaUsuario(curvaUsuario)} />}

      {lectura && !lectura.ok && (
        <div className="frac-usuario-errores" role="alert">
          <b>No se puede usar este archivo:</b>
          <ul>
            {lectura.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {lectura?.ok && (
        <div className="frac-usuario-previa" aria-label="Vista previa de la curva FRAC">
          <dl>
            <div>
              <dt>Fecha de la curva</dt>
              <dd>{F.date(lectura.curva.fechaBase)}</dd>
            </div>
            <div>
              <dt>Nodos</dt>
              <dd>{nf(0).format(lectura.curva.datos.length)}</dd>
            </div>
            <div>
              <dt>Hasta</dt>
              <dd>{F.date(lectura.curva.datos[lectura.curva.datos.length - 1][0])}</dd>
            </div>
            <div>
              <dt>Rango</dt>
              <dd>
                {F.pct(Math.min(...lectura.curva.datos.map((d) => d[1])), 2)} – {F.pct(Math.max(...lectura.curva.datos.map((d) => d[1])), 2)}
              </dd>
            </div>
          </dl>
          <MiniCurva datos={lectura.curva.datos} etiqueta="Vista previa de la curva FRAC" />
          {lectura.avisos.map((a) => (
            <p key={a} className="src">
              {a}
            </p>
          ))}
          <p className="src">Archivo: {lectura.curva.archivo}</p>
          <div className="frac-usuario-barra">
            <button type="button" className="btn primary sm" onClick={usar}>
              Usar esta curva
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setLectura(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
