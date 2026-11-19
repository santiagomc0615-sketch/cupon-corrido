"use client";
/* «Cargar datos» (calculadora IBR, IPC y UVR, y Curva TES): curva FRAC (FRA IBR) o expectativas de
   inflación desde un Excel o CSV. Lee el archivo en el navegador (lib/cargas-usuario/lector.ts), deja
   elegir la hoja y las columnas, muestra una vista previa y, con «Usar estos datos», guarda la serie en
   el navegador (no hay inicio de sesión) y el motor la recibe. «Volver a los datos por defecto» la borra. */
import { useId, useMemo, useRef, useState } from "react";
import { Chart, nearest } from "@/components/charts/Chart";
import { useApp } from "@/components/providers/AppProvider";
import { filasCSV, type Celda } from "@/lib/cargas/leer";
import { etiquetaSerie, type SerieUsuario } from "@/lib/cargas-usuario/datos";
import { analizarArchivo, CONFIG_TIPO, extremos, leerSerie, type Seleccion, type TipoSerieUsuario } from "@/lib/cargas-usuario/lector";
import { toN, type TuplaFecha } from "@/lib/engine";
import { F, nf, pctAx } from "@/lib/format";

interface Archivo {
  nombre: string;
  hojas: { hoja: string; filas: Celda[][] }[];
  comaDecimal: boolean;
}

const TIPOS: TipoSerieUsuario[] = ["frac", "exp"];

/** Serie como puntos del gráfico: x en años desde la primera fecha. */
const puntos = (d: TuplaFecha[]): [number, number][] => {
  const n0 = toN(d[0][0]);
  return d.map(([f, v]) => [(toN(f) - n0) / 365, v]);
};

export function MiniSerie({ datos, etiqueta }: { datos: TuplaFecha[]; etiqueta: string }) {
  const s = puntos(datos);
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
        const i = Math.max(0, s.indexOf(p));
        return { x: p[0], y: p[1], content: <>{F.date(datos[i][0])} · {F.pct(p[1], 3)}</> };
      }}
    />
  );
}

function Estado({ s, onQuitar }: { s: SerieUsuario; onQuitar: () => void }) {
  return (
    <div className="carga-estado" role="status">
      <span className="chip">
        <span className="dot" />
        En uso
      </span>
      <span>
        {etiquetaSerie(s)}
        <span className="src">
          {" "}
          · {nf(0).format(s.datos.length)} filas · {s.archivo}
        </span>
      </span>
      <button type="button" className="btn sm ghost" onClick={onQuitar}>
        Volver a los datos por defecto
      </button>
    </div>
  );
}

export function CargarDatos({ tipoInicial = "frac", abierto: abiertoInicial = false }: { tipoInicial?: TipoSerieUsuario; abierto?: boolean }) {
  const { datosUsuario, usarDatosUsuario, quitarDatosUsuario, toast } = useApp();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [tipo, setTipo] = useState<TipoSerieUsuario>(tipoInicial);
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const analisis = useMemo(() => (archivo ? analizarArchivo(archivo.hojas, tipo, archivo.comaDecimal) : null), [archivo, tipo]);
  const hoja = analisis && sel ? analisis.analisis[sel.hoja] : null;
  const lectura = useMemo(
    () => (archivo && hoja && sel ? leerSerie(archivo.hojas[sel.hoja].filas, hoja, sel.colFecha, sel.colValor, tipo, archivo.comaDecimal) : null),
    [archivo, hoja, sel, tipo],
  );

  const elegirTipo = (t: TipoSerieUsuario) => {
    setTipo(t);
    if (archivo) setSel(analizarArchivo(archivo.hojas, t, archivo.comaDecimal).sugerida);
  };

  const leer = async (f: File) => {
    setLeyendo(true);
    setError(null);
    setArchivo(null);
    setSel(null);
    try {
      let a: Archivo;
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const hojas = await readXlsxFile(f);
        a = { nombre: f.name, hojas: hojas.map((h) => ({ hoja: h.sheet, filas: h.data as Celda[][] })), comaDecimal: true };
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const { filas, comaDecimal } = filasCSV(await f.text());
        a = { nombre: f.name, hojas: [{ hoja: f.name, filas }], comaDecimal };
      } else {
        setError("Formato no soportado: use un Excel (.xlsx) o un CSV.");
        return;
      }
      if (!a.hojas.length) {
        setError("El archivo no tiene hojas con datos.");
        return;
      }
      setArchivo(a);
      setSel(analizarArchivo(a.hojas, tipo, a.comaDecimal).sugerida);
    } catch {
      setError("No se pudo leer el archivo. Revise que sea un Excel (.xlsx) o un CSV válido.");
    } finally {
      setLeyendo(false);
    }
  };

  const cancelar = () => {
    setArchivo(null);
    setSel(null);
    setError(null);
  };

  const usar = () => {
    if (!lectura?.ok || !archivo || !sel) return;
    const serie: SerieUsuario = {
      tipo,
      datos: lectura.serie.datos,
      archivo: archivo.hojas.length > 1 ? `${archivo.nombre} · ${archivo.hojas[sel.hoja].hoja}` : archivo.nombre,
      cargada: new Date().toISOString(),
    };
    usarDatosUsuario(serie);
    cancelar();
    setAbierto(false);
    toast(`${etiquetaSerie(serie)} · en uso`);
  };

  const activas = TIPOS.map((t) => datosUsuario[t]).filter((s): s is SerieUsuario => !!s);
  const cfg = CONFIG_TIPO[tipo];
  const ext = lectura?.ok ? extremos(lectura.serie.datos) : null;

  return (
    <div className="carga-usuario">
      <div className="carga-barra">
        <button type="button" className="btn sm" aria-expanded={abierto} aria-controls={`${id}-panel`} onClick={() => setAbierto(!abierto)}>
          Cargar datos
        </button>
        <span className="src">Curva FRAC o expectativas de inflación desde un Excel o CSV.</span>
      </div>

      {activas.map((s) => (
        <Estado key={s.tipo} s={s} onQuitar={() => quitarDatosUsuario(s.tipo)} />
      ))}

      {abierto && (
        <div className="carga-panel" id={`${id}-panel`}>
          <p className="src" id={`${id}-pregunta`}>
            ¿Qué datos va a cargar?
          </p>
          <div className="carga-tipos" role="radiogroup" aria-labelledby={`${id}-pregunta`}>
            {TIPOS.map((t) => (
              <label key={t} className={`carga-tipo${tipo === t ? " on" : ""}`}>
                <input type="radio" name={`${id}-tipo`} checked={tipo === t} onChange={() => elegirTipo(t)} />
                <span>
                  <b>{CONFIG_TIPO[t].nombre}</b>
                  <span className="src">{t === "frac" ? "Fecha y tasa forward" : "Fecha (o mes/año) e inflación anual"}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="carga-barra">
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.csv,.txt"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void leer(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn sm" onClick={() => entrada.current?.click()} disabled={leyendo}>
              {leyendo ? "Leyendo…" : archivo ? "Elegir otro archivo" : "Elegir archivo (Excel o CSV)"}
            </button>
            {archivo && <span className="src">{archivo.nombre}</span>}
          </div>

          {error && (
            <p className="carga-error" role="alert">
              {error}
            </p>
          )}

          {analisis && sel && hoja && (
            <div className="carga-columnas">
              {analisis.analisis.length > 1 && (
                <div className="f">
                  <label htmlFor={`${id}-hoja`}>Hoja</label>
                  <select
                    id={`${id}-hoja`}
                    value={sel.hoja}
                    onChange={(e) => {
                      const h = +e.target.value;
                      const a = analisis.analisis[h];
                      setSel({ hoja: h, colFecha: a.colFecha, colValor: a.colValor });
                    }}
                  >
                    {analisis.analisis.map((a, i) => (
                      <option key={a.hoja + i} value={i}>
                        {a.hoja}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="f">
                <label htmlFor={`${id}-fecha`}>Columna de fecha</label>
                <select id={`${id}-fecha`} value={sel.colFecha} onChange={(e) => setSel({ ...sel, colFecha: +e.target.value })}>
                  <option value={-1}>Elegir…</option>
                  {hoja.columnas.map((c) => (
                    <option key={c.indice} value={c.indice}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label htmlFor={`${id}-valor`}>Columna de {cfg.valor.toLowerCase()}</label>
                <select id={`${id}-valor`} value={sel.colValor} onChange={(e) => setSel({ ...sel, colValor: +e.target.value })}>
                  <option value={-1}>Elegir…</option>
                  {hoja.columnas.map((c) => (
                    <option key={c.indice} value={c.indice}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {lectura && !lectura.ok && (
            <p className="carga-error" role="alert">
              {lectura.error}
            </p>
          )}

          {lectura?.ok && ext && (
            <div className="carga-previa" aria-label={`Vista previa: ${cfg.nombre}`}>
              <dl>
                <div>
                  <dt>Fecha inicial</dt>
                  <dd>{F.date(lectura.serie.datos[0][0])}</dd>
                </div>
                <div>
                  <dt>Fecha final</dt>
                  <dd>{F.date(lectura.serie.datos[lectura.serie.datos.length - 1][0])}</dd>
                </div>
                <div>
                  <dt>Filas</dt>
                  <dd>{nf(0).format(lectura.serie.datos.length)}</dd>
                </div>
              </dl>
              <MiniSerie datos={lectura.serie.datos} etiqueta={`Vista previa: ${cfg.nombre}`} />
              <div className="tbl">
                <table>
                  <caption className="src">Primeras y últimas filas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">{cfg.valor}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ext.primeras.map(([f, v]) => (
                      <tr key={"p" + f}>
                        <td>{F.date(f)}</td>
                        <td>{F.pct(v, 3)}</td>
                      </tr>
                    ))}
                    {ext.ultimas.length > 0 && (
                      <tr aria-hidden="true">
                        <td>…</td>
                        <td>…</td>
                      </tr>
                    )}
                    {ext.ultimas.map(([f, v]) => (
                      <tr key={"u" + f}>
                        <td>{F.date(f)}</td>
                        <td>{F.pct(v, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lectura.serie.avisos.map((a) => (
                <p key={a} className="src">
                  {a}
                </p>
              ))}
              <div className="carga-barra">
                <button type="button" className="btn primary sm" onClick={usar}>
                  Usar estos datos
                </button>
                <button type="button" className="btn sm ghost" onClick={cancelar}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
