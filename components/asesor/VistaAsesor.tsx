"use client";
/* Asesor de IA: envía la pregunta, el historial corto y el contexto (mercado + portafolio)
   a /api/asesor y muestra la respuesta en streaming. */
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Encabezado } from "@/components/ui";
import { ctxSnapshot, md, QUICK } from "@/lib/asesor/contexto";
import { F } from "@/lib/format";

interface Mensaje {
  rol: "u" | "a";
  texto: string;
  /** true si el texto lo generó el modelo (no un mensaje fijo de la página). */
  ia?: boolean;
  /** Mensaje de error (no se envía como historial). */
  error?: boolean;
}

const BIENVENIDA: Mensaje = {
  rol: "a",
  texto:
    "Hola. Tengo cargados la tasa de política, la inflación del DANE, el IBR, la UVR, la curva TES y tu portafolio. Elige una consulta rápida o escríbeme tu pregunta.",
};

/** Turnos anteriores que se envían como contexto de la conversación. */
const TURNOS_HISTORIAL = 6;

export function VistaAsesor() {
  const { snap, mk, motor, pfValorado, pfMetricas } = useApp();
  const [msgs, setMsgs] = useState<Mensaje[]>([BIENVENIDA]);
  const [pregunta, setPregunta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [restantes, setRestantes] = useState<number | null>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [msgs]);

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

    setOcupado(true);
    setMsgs((m) => [...m, { rol: "u", texto: q }, { rol: "a", texto: "", ia: true }]);
    try {
      const r = await fetch("/api/asesor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta: q,
          historial: pares.slice(-TURNOS_HISTORIAL),
          contexto: ctxSnapshot(snap, mk, motor, pfValorado, pfMetricas),
        }),
      });
      const quedan = r.headers.get("X-Consultas-Restantes");
      if (quedan != null) setRestantes(Number(quedan));
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
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
                  <div className="who">Asesor · Cupón Corrido{m.ia ? " · Respuesta generada por IA" : ""}</div>
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
              Respuestas generadas por IA (Claude, de Anthropic). Herramienta académica, no es asesoría financiera. Límite:
              20 consultas por hora.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
