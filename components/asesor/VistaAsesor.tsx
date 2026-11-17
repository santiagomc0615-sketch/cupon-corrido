"use client";
/* Asesor de IA como agente con herramientas: envía la pregunta, el historial corto, el perfil del
   cliente, el modo (chat, comité de inversión o informe) y las entradas del portafolio, del título de
   la calculadora y del fondeo a /api/asesor. El servidor valora todo con el motor y el modelo saca
   cada cifra de una herramienta. La respuesta llega en NDJSON (texto + herramientas usadas). */
import { useEffect, useRef, useState } from "react";
import { useFondeo } from "@/components/fondeo/ControlesFondeo";
import { AVISO_TRIBUTARIO, PanelImpuestos, useImpuestos } from "@/components/pyg/Impuestos";
import { useApp } from "@/components/providers/AppProvider";
import { BotonInformeAsesor, fondeoConfigurado } from "@/components/reporte/BotonReporte";
import { Encabezado } from "@/components/ui";
import { md, MENSAJE_DEMO, QUICK } from "@/lib/asesor/contexto";
import { etiquetaHerramienta } from "@/lib/asesor/etiquetas";
import type { Modo, Perfil } from "@/lib/asesor/peticion";
import { BRAND } from "@/lib/brand";
import { F } from "@/lib/format";
import { useGuardado } from "@/lib/storage";

interface UsoHerramienta {
  id: string;
  nombre: string;
  estado: "pidiendo" | "listo" | "error";
}

interface Mensaje {
  rol: "u" | "a";
  texto: string;
  /** true si el texto lo generó el modelo (no un mensaje fijo de la página). */
  ia?: boolean;
  /** Mensaje de error (no se envía como historial). */
  error?: boolean;
  /** Respuesta del modo demo. */
  demo?: boolean;
  /** Herramientas que usó el agente para esta respuesta. */
  herramientas?: UsoHerramienta[];
  modo?: Modo;
  perfil?: Perfil;
  /** La respuesta terminó (para ofrecer el PDF del informe). */
  completo?: boolean;
}

const PERFILES: [Perfil, string][] = [
  ["conservador", "Conservador"],
  ["moderado", "Moderado"],
  ["agresivo", "Agresivo"],
];
const NOMBRE_PERFIL = Object.fromEntries(PERFILES) as Record<Perfil, string>;

const PREGUNTA_INFORME =
  "Genera el informe para el cliente sobre su portafolio actual: cómo está hoy, el contexto del mercado, qué pasaría si las tasas suben o bajan y qué le recomiendas según su perfil.";

const BIENVENIDA: Mensaje = {
  rol: "a",
  texto:
    "Hola. Para cada cifra consulto el motor de la calculadora: valoro títulos, simulo escenarios de tasas, comparo TES, IBR, IPC, UVR y CDT, analizo el fondeo y leo los datos del día. Elige el perfil del cliente y una consulta rápida, o escríbeme tu pregunta.",
};

/** Turnos anteriores que se envían como contexto de la conversación. */
const TURNOS_HISTORIAL = 6;

/** Respuesta de GET /api/asesor. */
interface EstadoAsesor {
  activo: boolean;
  mensajeDemo: string | null;
  consultasPorHora: number;
}

const DEMO_POR_DEFECTO = MENSAJE_DEMO;

type EventoNDJSON = { t: string; d?: string; id?: string; nombre?: string; estado?: UsoHerramienta["estado"] };

export function VistaAsesor() {
  const { snap, mk, pf, pfDate, pfValorado, calc } = useApp();
  const { c: fondeo } = useFondeo();
  const { perfil: perfilTrib, params: paramsTrib, editados } = useImpuestos();
  const [verTrib, setVerTrib] = useState(false);
  const [perfil, setPerfil] = useGuardado<Perfil>("asesorPerfil", "moderado");
  const [comite, setComite] = useState(false);
  const [msgs, setMsgs] = useState<Mensaje[]>([BIENVENIDA]);
  const [pregunta, setPregunta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoAsesor | null>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [msgs]);

  // ¿Está configurada la clave de API? Si no, la página funciona en modo demo.
  useEffect(() => {
    let vivo = true;
    fetch("/api/asesor", { cache: "no-store" })
      .then((r) => r.json())
      .then((e: EstadoAsesor) => vivo && setEstado(e))
      .catch(() => vivo && setEstado({ activo: false, mensajeDemo: DEMO_POR_DEFECTO, consultasPorHora: 20 }));
    return () => {
      vivo = false;
    };
  }, []);
  const demo = estado != null && !estado.activo;
  const mensajeDemo = estado?.mensajeDemo ?? DEMO_POR_DEFECTO;

  /** Reemplaza el último mensaje (la respuesta en curso). */
  const actualizarUltimo = (cambio: Partial<Mensaje>) =>
    setMsgs((m) => [...m.slice(0, -1), { ...m[m.length - 1], ...cambio }]);

  const preguntar = async (q: string, modoForzado?: Modo) => {
    if (ocupado || !q.trim()) return;
    const modo: Modo = modoForzado ?? (comite ? "comite" : "chat");
    // pares pregunta–respuesta anteriores (solo los que tuvieron respuesta de IA)
    const pares: { role: "user" | "assistant"; content: string }[] = [];
    msgs.forEach((m, i) => {
      const sig = msgs[i + 1];
      if (m.rol === "u" && sig?.rol === "a" && sig.ia && !sig.error && sig.texto.trim())
        pares.push({ role: "user", content: m.texto }, { role: "assistant", content: sig.texto });
    });

    // Modo demo: la interfaz responde sin llamar al servidor.
    if (demo) {
      setMsgs((m) => [...m, { rol: "u", texto: q, modo }, { rol: "a", texto: mensajeDemo, demo: true }]);
      return;
    }

    setOcupado(true);
    setMsgs((m) => [...m, { rol: "u", texto: q, modo }, { rol: "a", texto: "", ia: true, herramientas: [], modo, perfil }]);
    try {
      const r = await fetch("/api/asesor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: q,
          // la primera consulta rápida no depende del portafolio: el servidor la guarda 24 h
          ...(q === QUICK[0][2] && modo === "chat" ? { rapida: "resumen" } : {}),
          historial: pares.slice(-TURNOS_HISTORIAL),
          perfil,
          modo,
          titulo: calc.inputs[calc.type],
          portafolio: { fecha: pfDate, posiciones: pf.map((p) => p.inputs) },
          fondeo: fondeoConfigurado() ? fondeo : null,
          tributario: { perfil: perfilTrib, params: editados ? paramsTrib : null },
        }),
      });
      const quedan = r.headers.get("X-Consultas-Restantes");
      if (quedan != null) setRestantes(Number(quedan));
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        if (j.demo) {
          setEstado((e) => ({ activo: false, mensajeDemo: j.error, consultasPorHora: e?.consultasPorHora ?? 20 }));
          actualizarUltimo({ texto: j.error, ia: false, demo: true });
          return;
        }
        actualizarUltimo({ texto: j.error ?? `No se pudo completar el análisis (HTTP ${r.status}).`, ia: false, error: true });
        return;
      }
      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let texto = "";
      // texto al cerrar la última vuelta con herramientas (si la API repite una vuelta, se vuelve ahí)
      let marca = 0;
      let herramientas: UsoHerramienta[] = [];
      let resto = "";
      const procesar = (l: string) => {
        if (!l.trim()) return;
        let e: EventoNDJSON;
        try {
          e = JSON.parse(l);
        } catch {
          return;
        }
        if (e.t === "texto" && e.d) texto += e.d;
        else if (e.t === "nota" && e.d) texto += `\n\n_${e.d}_`;
        else if (e.t === "reintento") texto = texto.slice(0, marca);
        else if (e.t === "herramienta" && e.id && e.nombre && e.estado) {
          const u: UsoHerramienta = { id: e.id, nombre: e.nombre, estado: e.estado };
          herramientas = herramientas.some((h) => h.id === u.id) ? herramientas.map((h) => (h.id === u.id ? u : h)) : [...herramientas, u];
          if (e.estado !== "pidiendo") marca = texto.length;
        }
      };
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        lineas.forEach(procesar);
        actualizarUltimo({ texto, herramientas });
      }
      procesar(resto + dec.decode());
      actualizarUltimo({ texto: texto || "_No llegó respuesta. Intente de nuevo._", herramientas, error: !texto, completo: !!texto });
    } catch {
      actualizarUltimo({ texto: "No hubo conexión con el servidor. Intente de nuevo.", ia: false, error: true });
    } finally {
      setOcupado(false);
    }
  };

  const enviar = () => {
    const q = pregunta;
    setPregunta("");
    void preguntar(q);
  };

  return (
    <section className="view">
      <Encabezado
        eyebrow="Análisis con inteligencia artificial"
        lede="Un agente que consulta el motor de la calculadora para cada cifra: valora, simula escenarios, compara alternativas y analiza el fondeo, y lo explica según el perfil del cliente. Es una herramienta académica: no la tomes como recomendación de inversión."
      >
        Asesor de <em>inversión</em>
      </Encabezado>
      {demo && (
        <div className="notice demo-asesor" role="status">
          <span className="chip warn">
            <span className="dot" />
            Demo
          </span>
          <span>
            <b>{mensajeDemo}</b> Puede recorrer la interfaz y las consultas rápidas; las respuestas de Claude aparecen cuando
            el servidor tiene configurada la variable ANTHROPIC_API_KEY.
          </span>
        </div>
      )}
      <div className="advisor">
        <div className="panel chat">
          <div className="asesor-barra">
            <div className="f">
              <span className="etq" id="perfil-etq">
                Perfil del cliente
              </span>
              <div className="seg" role="group" aria-labelledby="perfil-etq">
                {PERFILES.map(([v, t]) => (
                  <button key={v} type="button" aria-pressed={perfil === v} onClick={() => setPerfil(v)} disabled={ocupado}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <label className="interruptor">
              <input type="checkbox" role="switch" checked={comite} onChange={(e) => setComite(e.target.checked)} disabled={ocupado} />
              <span>
                <b>Comité de inversión</b>
                <small>Caso a favor, caso en contra y conclusión</small>
              </span>
            </label>
          </div>
          <div className="msgs" ref={lista} aria-live="polite" aria-busy={ocupado}>
            {msgs.map((m, i) =>
              m.rol === "u" ? (
                <div key={i} className="msg u">
                  {m.modo === "comite" && <span className="msg-etq">Al comité</span>}
                  {m.texto}
                </div>
              ) : (
                <div key={i} className="msg a">
                  <div className="who">
                    Asesor · {BRAND.nombre}
                    {m.modo === "comite" ? " · Comité de inversión" : m.modo === "informe" ? " · Informe para el cliente" : ""}
                    {m.perfil ? ` · Perfil ${NOMBRE_PERFIL[m.perfil].toLowerCase()}` : ""}
                    {m.ia ? " · Respuesta generada por IA" : m.demo ? " · Modo demo" : ""}
                  </div>
                  {m.herramientas && m.herramientas.length > 0 && (
                    <ul className="herramientas" aria-label="Cálculos del motor que usó el asesor">
                      {m.herramientas.map((h) => (
                        <li key={h.id} className={`chip ${h.estado === "error" ? "warn" : h.estado === "listo" ? "pos" : ""}`}>
                          <span className="dot" />
                          {h.estado === "pidiendo" ? "Calculando: " : h.estado === "error" ? "Sin dato: " : ""}
                          {etiquetaHerramienta(h.nombre)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.texto ? (
                    // md() escapa el texto antes de convertirlo
                    <div dangerouslySetInnerHTML={{ __html: md(m.texto) }} style={m.error ? { color: "var(--warn-texto)" } : undefined} />
                  ) : (
                    <p className="src">{m.herramientas?.length ? "Calculando con el motor…" : "Analizando datos…"}</p>
                  )}
                  {m.modo === "informe" && m.completo && !m.error && (
                    <div className="informe-pdf">
                      <BotonInformeAsesor texto={m.texto} perfil={NOMBRE_PERFIL[m.perfil ?? perfil]} />
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
          <div className="composer">
            <label htmlFor="ask" className="sr-only">
              Tu pregunta
            </label>
            <textarea
              id="ask"
              rows={2}
              maxLength={2000}
              placeholder={comite ? "Propuesta para el comité: p. ej. «Comprar TES 2036 fondeado con simultáneas»" : "Pregunta sobre la economía, la curva o tus posiciones…"}
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            <button type="button" className="btn primary" onClick={enviar} disabled={ocupado || !pregunta.trim()}>
              {ocupado ? "Analizando…" : comite ? "Llevar al comité" : "Enviar"}
            </button>
          </div>
          {restantes != null && (
            <p className="src" style={{ marginTop: 8 }}>
              Te quedan {restantes} consultas en esta hora.
            </p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="informe-cta">
            <button type="button" className="btn primary" disabled={ocupado || !pf.length} onClick={() => void preguntar(PREGUNTA_INFORME, "informe")}>
              Generar informe para el cliente
            </button>
            <p className="src">
              En lenguaje sencillo, para el perfil {NOMBRE_PERFIL[perfil].toLowerCase()} y con las cifras del motor. Al terminar se
              descarga en PDF.
            </p>
          </div>
          <h2 className="h-sub">Consultas rápidas</h2>
          <div className="prompts">
            {QUICK.map(([t, d, q]) => (
              <button key={t} type="button" disabled={ocupado} onClick={() => void preguntar(q)}>
                <b>{t}</b>
                <span>{d}</span>
              </button>
            ))}
          </div>
          <div className="notice" style={{ fontSize: 12 }}>
            <span>
              <b>Lo que consulta el asesor:</b> TPM {F.pct(snap.macro.tpm, 2)} ({F.date(snap.macro.tpmFecha)}), IPC{" "}
              {F.pct(mk.ipcLast.annual, 2)} ({mk.ipcLast.f.slice(0, 7)}), IBR al {F.date(mk.ibrLast.f)}, curva TES del{" "}
              {F.date(snap.datos.curveDate)}, {pfValorado.length} posiciones del portafolio, el título de la calculadora y tu fondeo.
              Las cifras salen del motor; el modelo no calcula.
            </span>
          </div>
          <div className="notice" style={{ fontSize: 12, flexDirection: "column", alignItems: "flex-start" }}>
            <span>
              <b>Impuestos:</b> {AVISO_TRIBUTARIO}
            </span>
            <button type="button" className="enlace" aria-expanded={verTrib} onClick={() => setVerTrib(!verTrib)}>
              {verTrib ? "Ocultar perfil tributario" : "Ver o cambiar el perfil tributario"}
            </button>
          </div>
          {verTrib && <PanelImpuestos />}
          <div className="notice" style={{ fontSize: 12 }}>
            <span className="chip warn">
              <span className="dot" />
              IA
            </span>
            <span>
              Respuestas generadas por IA (Claude, de Anthropic). {BRAND.avisoLegal} Límite: {estado?.consultasPorHora ?? 20}{" "}
              consultas por hora.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
