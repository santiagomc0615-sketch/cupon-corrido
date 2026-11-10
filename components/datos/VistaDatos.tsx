"use client";
/* Sección /datos: carga de series sin API oficial (curvas FRAC, IPC, expectativas, IBR 12M, TES).
   Un Excel puede traer varias hojas (p. ej. Curva_FRAC y Curva_FRAC_Venta): cada una se reconoce,
   se muestra en vista previa y se guarda por separado. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Chart } from "@/components/charts/Chart";
import { TablaFuentes } from "@/components/datos/EstadoFuentes";
import { useApp } from "@/components/providers/AppProvider";
import { Aviso, Encabezado, Panel } from "@/components/ui";
import { detectarCSV, detectarHojas, idCurva, type Detectada, type HojaLeida, type TipoCSV } from "@/lib/cargas/leer";
import { NOMBRE_SERIE, type Carga, type TipoEliminable, type TipoSerieCargada } from "@/lib/cargas/tipos";
import { validarCarga } from "@/lib/cargas/validar";
import { CURVA_EXCEL, toN } from "@/lib/engine";
import { F, nf, pctAx } from "@/lib/format";

interface Item {
  d: Exclude<Detectada, { tipo: "ignorada" }>;
  incluir: boolean;
  /** Para curvas FRAC */
  id: string;
  nombre: string;
  /** Para TES */
  fecha: string;
}

interface EstadoServidor {
  claveConfigurada: boolean;
  puedeGuardar: boolean;
}

const CLAVE_SESION = "cc_admin";

/** Hoja de referencias TES (tasa fija o UVR). */
const esTES = (d: Item["d"]): d is Extract<Item["d"], { refs: unknown }> => "refs" in d;

function aCarga(it: Item, archivo: string): Carga {
  const origen = `${archivo} · ${it.d.hoja}`;
  const d = it.d;
  if (d.tipo === "frac")
    return { tipo: "frac", id: it.id, nombre: it.nombre.trim(), fechaBase: d.datos[0]?.[0] ?? "", filas: d.datos.length, origen, cargada: "", datos: d.datos };
  if ("refs" in d) return { tipo: d.tipo, origen, cargada: "", fecha: it.fecha, refs: d.refs };
  return { tipo: d.tipo, origen, cargada: "", datos: d.datos };
}

export function VistaDatos() {
  const { snap, toast } = useApp();
  const router = useRouter();
  const [servidor, setServidor] = useState<EstadoServidor | null>(null);
  const [clave, setClave] = useState("");
  const [archivo, setArchivo] = useState<{ nombre: string; texto?: string } | null>(null);
  const [tipoCSV, setTipoCSV] = useState<TipoCSV>("frac");
  const [fechaCSV, setFechaCSV] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [ignoradas, setIgnoradas] = useState<{ hoja: string; motivo: string }[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/datos")
      .then((r) => r.json())
      .then(setServidor)
      .catch(() => setServidor(null));
    try {
      const c = sessionStorage.getItem(CLAVE_SESION);
      if (c) setTimeout(() => setClave(c), 0);
    } catch {
      /* sin sessionStorage */
    }
  }, []);

  const recordarClave = (c: string) => {
    setClave(c);
    try {
      if (c) sessionStorage.setItem(CLAVE_SESION, c);
      else sessionStorage.removeItem(CLAVE_SESION);
    } catch {
      /* sin sessionStorage */
    }
  };

  const prepararItems = (dets: Detectada[]) => {
    setIgnoradas(dets.filter((d): d is Extract<Detectada, { tipo: "ignorada" }> => d.tipo === "ignorada").map((d) => ({ hoja: d.hoja, motivo: d.motivo })));
    setItems(
      dets
        .filter((d): d is Item["d"] => d.tipo !== "ignorada")
        .map((d) => {
          const fb = d.tipo === "frac" ? (d.datos[0]?.[0] ?? "") : "";
          return {
            d,
            incluir: esTES(d) ? d.refs.length > 0 : d.datos.length > 0,
            id: idCurva(fb || "sin-fecha"),
            nombre: d.tipo === "frac" ? `${d.sugerido} · ${fb ? F.date(fb) : d.hoja}` : "",
            fecha: esTES(d) ? d.fecha : "",
          };
        }),
    );
  };

  const leerArchivo = async (f: File) => {
    setError(null);
    setItems([]);
    setIgnoradas([]);
    setLeyendo(true);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const hojas = await readXlsxFile(f);
        setArchivo({ nombre: f.name });
        prepararItems(detectarHojas(hojas.map((h): HojaLeida => ({ hoja: h.sheet, filas: h.data as HojaLeida["filas"] }))));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const texto = await f.text();
        setArchivo({ nombre: f.name, texto });
        prepararItems([detectarCSV(f.name, texto, tipoCSV, fechaCSV)]);
      } else {
        setError("Formato no soportado: use .xlsx o .csv.");
      }
    } catch (e) {
      setError("No se pudo leer el archivo: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLeyendo(false);
    }
  };

  const releerCSV = (tipo: TipoCSV, fecha: string) => {
    setTipoCSV(tipo);
    setFechaCSV(fecha);
    if (archivo?.texto != null) prepararItems([detectarCSV(archivo.nombre, archivo.texto, tipo, fecha)]);
  };

  const cambiar = (i: number, cambio: Partial<Item>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...cambio } : x)));

  const enviar = async (cuerpo: unknown) => {
    const r = await fetch("/api/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": clave },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error([j.error, ...(j.problemas ?? [])].filter(Boolean).join(" ") || "HTTP " + r.status);
    return j;
  };

  const guardar = async () => {
    if (!archivo) return;
    const elegidos = items.filter((x) => x.incluir);
    setGuardando(true);
    setError(null);
    const hechos: string[] = [];
    try {
      for (const it of elegidos) {
        await enviar({ accion: "guardar", carga: aCarga(it, archivo.nombre) });
        hechos.push(it.d.tipo === "frac" ? it.nombre : NOMBRE_SERIE[it.d.tipo]);
      }
      toast(`Guardado: ${hechos.join(", ")}`);
      setItems([]);
      setIgnoradas([]);
      setArchivo(null);
      router.refresh();
    } catch (e) {
      setError(`${hechos.length ? "Se guardó " + hechos.join(", ") + ". " : ""}Error: ${e instanceof Error ? e.message : e}`);
      if (hechos.length) router.refresh();
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (tipo: TipoEliminable, id: string | undefined, nombre: string) => {
    if (!confirm(`¿Eliminar «${nombre}»? Esta acción no se puede deshacer.`)) return;
    try {
      await enviar({ accion: "eliminar", tipo, id });
      toast("Eliminado: " + nombre);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const renombrar = async (id: string, actual: string) => {
    const nombre = prompt("Nuevo nombre de la curva", actual)?.trim();
    if (!nombre || nombre === actual) return;
    try {
      await enviar({ accion: "renombrar", id, nombre });
      toast("Curva renombrada");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Fuerza la actualización de las fuentes en vivo (IPC del DANE incluido) con la clave escrita. */
  const actualizarAhora = async () => {
    setActualizando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/actualizar", { method: "POST", headers: { Authorization: `Bearer ${clave.trim()}` } });
      const j = await r.json();
      if (!r.ok && !j.ipc) throw new Error(j.error ?? `HTTP ${r.status}`);
      const i = j.ipc;
      setResultado(
        i.ultimoMes
          ? `IPC del DANE hasta ${i.ultimoMes}: ${String(i.inflacionAnual).replace(".", ",")} % anual${i.nuevo ? " (dato nuevo)" : ""}. ` +
              (i.ultimoMes < i.esperado ? `Aún no aparece ${i.esperado}. ` : "") +
              "Recargando la página…"
          : `El DANE no respondió: ${i.error ?? "sin detalle"}.`,
      );
      if (i.ultimoMes) setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setResultado(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setActualizando(false);
    }
  };

  const problemasDe = (it: Item) => (archivo ? validarCarga(aCarga(it, archivo.nombre)) : []);
  const elegidos = items.filter((x) => x.incluir);
  const hayProblemas = elegidos.some((x) => problemasDe(x).length > 0);
  const sinClave = !clave.trim();
  const bloqueado = !servidor?.claveConfigurada || !servidor?.puedeGuardar;
  const excel = snap.datos.frac;

  return (
    <section className="view">
      <Encabezado
        eyebrow="Series sin API oficial"
        lede="Aquí se cargan las curvas FRAC (pueden ser varias: por ejemplo la de compra y la de venta), el índice IPC del DANE, las expectativas de inflación, el IBR a 12 meses y las referencias TES. Un Excel puede traer varias hojas: cada una se reconoce por sus encabezados, como en el Excel del curso."
      >
        Cargar <em>datos</em>
      </Encabezado>

      {servidor && !servidor.claveConfigurada && (
        <div className="alert">La carga está desactivada: falta configurar ADMIN_KEY en el servidor (archivo .env.local o variables de Vercel).</div>
      )}
      {servidor && servidor.claveConfigurada && !servidor.puedeGuardar && (
        <div className="alert">Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN) para guardar las cargas en producción.</div>
      )}

      <div className="grid-c g2">
        <Panel titulo="1 · Clave de administrador" src="Se guarda solo en esta pestaña">
          <div className="f">
            <label htmlFor="clave">Clave (ADMIN_KEY)</label>
            <input id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => recordarClave(e.target.value)} />
          </div>
          <p className="src" style={{ marginTop: 8 }}>
            Cualquiera puede ver las curvas cargadas; solo quien tiene la clave puede subir, renombrar o eliminar.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" className="btn sm" disabled={sinClave || actualizando} onClick={() => void actualizarAhora()}>
              {actualizando ? "Actualizando…" : "Actualizar datos en vivo ahora"}
            </button>
            <span className="src">BanRep, TRM e IPC del DANE; se hace solo a las 12:00 y 21:00.</span>
          </div>
          {resultado && (
            <p className="src" role="status" style={{ marginTop: 8 }}>
              {resultado}
            </p>
          )}
        </Panel>
        <Panel titulo="2 · Archivo" src=".xlsx (varias hojas) o .csv">
          <div className="f">
            <label htmlFor="archivo">Excel o CSV</label>
            <input
              id="archivo"
              type="file"
              accept=".xlsx,.csv,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void leerArchivo(f);
                e.target.value = "";
              }}
            />
          </div>
          {archivo?.texto != null && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div className="f">
                <label htmlFor="tipoCSV">El CSV contiene</label>
                <select id="tipoCSV" value={tipoCSV} onChange={(e) => releerCSV(e.target.value as TipoCSV, fechaCSV)}>
                  {(["frac", "exp", "ipc", "ibr12", "tes", "tesuvr"] as TipoCSV[]).map((t) => (
                    <option key={t} value={t}>
                      {NOMBRE_SERIE[t]}
                    </option>
                  ))}
                </select>
              </div>
              {(tipoCSV === "tes" || tipoCSV === "tesuvr") && (
                <div className="f">
                  <label htmlFor="fechaCSV">Fecha de la curva</label>
                  <input id="fechaCSV" type="date" value={fechaCSV} onChange={(e) => releerCSV(tipoCSV, e.target.value)} />
                </div>
              )}
            </div>
          )}
          <p className="src" style={{ marginTop: 8 }}>
            CSV: fecha;valor por fila (TES: título;vencimiento;cupón;TIR). Fechas AAAA-MM-DD o DD/MM/AAAA; valores en
            fracción o en %.
          </p>
        </Panel>
      </div>

      {leyendo && <div className="panel empty">Leyendo el archivo…</div>}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {items.length > 0 && archivo && (
        <Panel titulo={`3 · Vista previa · ${archivo.nombre}`} src={`${items.length} hoja(s) reconocida(s)`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {items.map((it, i) => (
              <TarjetaHoja key={it.id + i} it={it} problemas={problemasDe(it)} onCambio={(c) => cambiar(i, c)} />
            ))}
            {ignoradas.length > 0 && (
              <details>
                <summary>{ignoradas.length} hoja(s) no se usan</summary>
                <ul className="src" style={{ margin: "8px 0 0 20px", listStyle: "disc" }}>
                  {ignoradas.map((h) => (
                    <li key={h.hoja}>
                      {h.hoja}: {h.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="btn primary" disabled={!elegidos.length || hayProblemas || sinClave || bloqueado || guardando} onClick={guardar}>
                {guardando ? "Guardando…" : `Guardar ${elegidos.length} serie(s)`}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setItems([]);
                  setIgnoradas([]);
                  setArchivo(null);
                }}
              >
                Cancelar
              </button>
              {sinClave && <span className="src">Escriba la clave de administrador para guardar.</span>}
              {hayProblemas && <span className="src">Corrija o desmarque las series con errores.</span>}
            </div>
          </div>
        </Panel>
      )}

      <Panel titulo="Curvas FRAC disponibles" src="La calculadora elige la de la fecha de valoración (compra) o la de la fecha de venta">
        <div className="tbl" style={{ maxHeight: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Curva</th>
                <th>Fecha base</th>
                <th>Filas</th>
                <th>Origen</th>
                <th>Cargada</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {snap.cargas.frac.map((c) => (
                <tr key={c.id}>
                  <td className="t">{c.nombre}</td>
                  <td>{F.date(c.fechaBase)}</td>
                  <td>{nf(0).format(c.filas)}</td>
                  <td className="t">{c.origen}</td>
                  <td>{c.cargada ? c.cargada.slice(0, 10) : "—"}</td>
                  <td>
                    <button type="button" className="btn sm ghost" disabled={sinClave} onClick={() => renombrar(c.id, c.nombre)}>
                      Renombrar
                    </button>{" "}
                    <button type="button" className="btn sm ghost" disabled={sinClave} onClick={() => eliminar("frac", c.id, c.nombre)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              <tr key={CURVA_EXCEL}>
                <td className="t">Excel del curso (Curva_FRAC)</td>
                <td>{F.date(excel[0][0])}</td>
                <td>{nf(0).format(excel.length)}</td>
                <td className="t">Respaldo · cada ~15 días</td>
                <td>—</td>
                <td className="t src">Siempre disponible</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel titulo="Otras series cargadas">
        {Object.keys(snap.cargas.series).length || snap.cargas.tes || snap.cargas.tesuvr ? (
          <div className="tbl" style={{ maxHeight: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Serie</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Filas</th>
                  <th>Origen</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(snap.cargas.series) as [TipoSerieCargada, NonNullable<(typeof snap.cargas.series)[TipoSerieCargada]>][]).map(([t, m]) => (
                  <tr key={t}>
                    <td className="t">{NOMBRE_SERIE[t]}</td>
                    <td>{m.desde}</td>
                    <td>{m.hasta}</td>
                    <td>{nf(0).format(m.filas)}</td>
                    <td className="t">{m.origen}</td>
                    <td>
                      <button type="button" className="btn sm ghost" disabled={sinClave} onClick={() => eliminar(t, undefined, NOMBRE_SERIE[t])}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {(["tes", "tesuvr"] as const).map((k) => {
                  const m = snap.cargas[k];
                  if (!m) return null;
                  return (
                    <tr key={k}>
                      <td className="t">{NOMBRE_SERIE[k]}</td>
                      <td>{m.fecha}</td>
                      <td>{m.hasta}</td>
                      <td>{m.filas}</td>
                      <td className="t">{m.origen}</td>
                      <td>
                        <button type="button" className="btn sm ghost" disabled={sinClave} onClick={() => eliminar(k, undefined, NOMBRE_SERIE[k])}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="src">Ninguna todavía: se usan los datos del Excel del curso.</p>
        )}
      </Panel>

      <Panel titulo="Estado de las fuentes">
        <TablaFuentes />
      </Panel>

      <Aviso etiqueta="Nota">
        La curva FRAC del respaldo viene muestreada cada ~15 días (así venía en el prototipo). Para valorar con la curva
        diaria del Excel, súbala aquí: el archivo del curso trae Curva_FRAC y Curva_FRAC_Venta y ambas se reconocen.
      </Aviso>
    </section>
  );
}

function TarjetaHoja({ it, problemas, onCambio }: { it: Item; problemas: string[]; onCambio: (c: Partial<Item>) => void }) {
  const d = it.d;
  const serie = esTES(d) ? null : d.datos;
  const desde = serie?.[0]?.[0],
    hasta = serie?.[serie.length - 1]?.[0];
  const unidad = d.tipo === "ipc" ? (v: number) => nf(2).format(v) : (v: number) => F.pct(v, 3);
  // muestra de hasta ~360 puntos para el gráfico
  const puntos =
    d.tipo === "frac" && serie?.length
      ? serie
          .filter((_, i) => i % Math.max(1, Math.ceil(serie.length / 360)) === 0 || i === serie.length - 1)
          .map(([f, v]) => [(toN(f) - toN(serie[0][0])) / 365, v] as [number, number])
      : null;
  return (
    <div className="sheet" style={{ padding: 14, opacity: it.incluir ? 1 : 0.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
          <input type="checkbox" checked={it.incluir} onChange={(e) => onCambio({ incluir: e.target.checked })} />
          {NOMBRE_SERIE[d.tipo]}
          <span className="tag">{d.hoja}</span>
        </label>
        <span className="src">
          {esTES(d)
            ? `${d.refs.length} referencias`
            : `${nf(0).format(serie!.length)} filas · ${desde ?? "—"} a ${hasta ?? "—"}`}
        </span>
      </div>

      {d.tipo === "frac" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 14, marginTop: 10 }} className="vista-frac">
          <div className="f">
            <label htmlFor={"n" + it.id}>Nombre de la curva</label>
            <input id={"n" + it.id} type="text" value={it.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} />
            <span className="src" style={{ marginTop: 4 }}>
              Fecha base {desde ? F.date(desde) : "—"} · primer valor {serie?.[0] ? F.pct(serie[0][1], 3) : "—"} · último{" "}
              {serie?.length ? F.pct(serie[serie.length - 1][1], 3) : "—"}
            </span>
          </div>
          {puntos && puntos.length > 1 && (
            <Chart series={[{ data: puntos, cls: "s-a" }]} yf={pctAx(1)} xf={(v) => v + "a"} label={"Curva " + it.nombre} h={150} />
          )}
        </div>
      )}

      {esTES(d) && (
        <div style={{ marginTop: 10 }}>
          <div className="f" style={{ maxWidth: 240 }}>
            <label htmlFor={"f" + it.id}>Fecha de la curva</label>
            <input id={"f" + it.id} type="date" value={it.fecha} onChange={(e) => onCambio({ fecha: e.target.value })} />
          </div>
          <p className="src" style={{ marginTop: 6 }}>
            {d.refs.slice(0, 4).map((r) => `${r[0]} (${F.pct(r[3], 3)})`).join(" · ")}
            {d.refs.length > 4 ? " …" : ""}. La curva cero se recalcula con el mismo bootstrapping de Curva_Rendimiento.
          </p>
        </div>
      )}

      {(d.tipo === "exp" || d.tipo === "ipc" || d.tipo === "ibr12") && serie?.length ? (
        <p className="src" style={{ marginTop: 8 }}>
          Primer valor {unidad(serie[0][1])} · último {unidad(serie[serie.length - 1][1])}
        </p>
      ) : null}

      {d.avisos.map((a) => (
        <p key={a} className="src" style={{ marginTop: 6, color: "var(--warn)" }}>
          {a}
        </p>
      ))}
      {it.incluir &&
        problemas.map((p) => (
          <div key={p} className="alert" style={{ marginTop: 8 }}>
            {p}
          </div>
        ))}
    </div>
  );
}
