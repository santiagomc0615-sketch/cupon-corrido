"use client";
/* Asesor de IA: envía la pregunta, el historial corto y el contexto (mercado + portafolio)
   a /api/asesor y muestra la respuesta en streaming. */
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Encabezado } from "@/components/ui";
import { ctxSnapshot, md, MENSAJE_DEMO, QUICK } from "@/lib/asesor/contexto";
import { BRAND } from "@/lib/brand";
import { F } from "@/lib/format";

interface Mensaje {
  rol: "u" | "a";
  texto: string;
  /** true si el texto lo generó el modelo (no un mensaje fijo de la página). */
  ia?: boolean;
  /** Mensaje de error (no se envía como historial). */
  error?: boolean;
  /** Respuesta del modo demo. */
  demo?: boolean;
}

const BIENVENIDA: Mensaje = {
  rol: "a",
  texto:
    "Hola. Tengo cargados la tasa de política, la inflación del DANE, el IBR, la UVR, la curva TES y tu portafolio. Elige una consulta rápida o escríbeme tu pregunta.",
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

export function VistaAsesor() {
  const { snap, mk, motor, pfValorado, pfMetricas } = useApp();
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

  const preguntar = async (q: string) => {
    if (ocupado || !q.trim()) return;
    // pares pregunta–respuesta anteriores (solo los que tuvieron respuesta de IA)
    const pares: { role: "user" | "assistant"; content: string }[] = [];
    msgs.forEach((m, i) => {
      const sig = msgs[i + 1];
      if (m.rol === "u" && sig?.rol === "a" && sig.ia && !sig.error && sig.texto.trim())
        pares.push({ role: "user", content: m.texto }, { role: "assistant", content: sig.texto });
    });

    // Modo demo: la interfaz responde sin llamar al servidor.
    if (demo) {
      setMsgs((m) => [...m, { rol: "u", texto: q }, { rol: "a", texto: mensajeDemo, demo: true }]);
      return;
    }

    setOcupado(true);
    setMsgs((m) => [...m, { rol: "u", texto: q }, { rol: "a", texto: "", ia: true }]);
    try {
      const r = await fetch("/api/asesor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: q,
          // la primera consulta rápida no depende del portafolio: el servidor la guarda 24 h
          ...(q === QUICK[0][2] ? { rapida: "resumen" } : {}),
          historial: pares.slice(-TURNOS_HISTORIAL),
          contexto: ctxSnapshot(snap, mk, motor, pfValorado, pfMetricas),
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
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        texto += dec.decode(value, { stream: true });
        actualizarUltimo({ texto });
      }
      texto += dec.decode();
      actualizarUltimo({ texto: texto || "_No llegó respuesta. Intente de nuevo._", error: !texto });
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
        lede="Lee los datos de mercado cargados, la curva TES y tu portafolio, y responde con un análisis en español. Es una herramienta académica: verifica siempre las cifras y no la tomes como recomendación de inversión."
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
          <div className="msgs" ref={lista} aria-live="polite" aria-busy={ocupado}>
            {msgs.map((m, i) =>
              m.rol === "u" ? (
                <div key={i} className="msg u">
                  {m.texto}
                </div>
              ) : (
                <div key={i} className="msg a">
                  <div className="who">
                    Asesor · {BRAND.nombre}
                    {m.ia ? " · Respuesta generada por IA" : m.demo ? " · Modo demo" : ""}
                  </div>
                  {m.texto ? (
                    // md() escapa el texto antes de convertirlo
                    <div dangerouslySetInnerHTML={{ __html: md(m.texto) }} style={m.error ? { color: "var(--warn)" } : undefined} />
                  ) : (
                    <p className="src">Analizando datos…</p>
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
              placeholder="Pregunta sobre la economía, la curva o tus posiciones…"
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
              {ocupado ? "Analizando…" : "Enviar"}
            </button>
          </div>
          {restantes != null && (
            <p className="src" style={{ marginTop: 8 }}>
              Te quedan {restantes} consultas en esta hora.
            </p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3>Consultas rápidas</h3>
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
              <b>Contexto que lee el asesor:</b> TPM {F.pct(snap.macro.tpm, 2)} ({F.date(snap.macro.tpmFecha)}), IPC{" "}
              {F.pct(mk.ipcLast.annual, 2)} ({mk.ipcLast.f.slice(0, 7)}), IBR al {F.date(mk.ibrLast.f)}, curva TES del{" "}
              {F.date(snap.datos.curveDate)} y {pfValorado.length} posiciones del portafolio.
            </span>
          </div>
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
