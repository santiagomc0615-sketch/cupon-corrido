"use client";
/* Asesor de IA. La interfaz ya funciona; la conexión con la API de Anthropic (app/api/asesor,
   con streaming y límite por IP) llega en la Fase 4. */
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Encabezado } from "@/components/ui";
import { md, QUICK } from "@/lib/asesor/contexto";
import { F } from "@/lib/format";

interface Mensaje {
  rol: "u" | "a";
  texto: string;
  /** true si el texto lo generó el modelo (no un mensaje fijo de la página). */
  ia?: boolean;
}

const BIENVENIDA: Mensaje = {
  rol: "a",
  texto:
    "Hola. Tengo cargados la tasa de política, la inflación del DANE, el IBR, la UVR, la curva TES y tu portafolio. Elige una consulta rápida o escríbeme tu pregunta.",
};

const SIN_CONEXION =
  "Todavía no estoy conectado a Claude: la conexión segura con la API de Anthropic se agrega en la siguiente fase. Cuando esté lista, responderé usando solo los datos de mercado y de tu portafolio que ves en el panel de contexto.";

export function VistaAsesor() {
  const { snap, mk, pfValorado } = useApp();
  const [msgs, setMsgs] = useState<Mensaje[]>([BIENVENIDA]);
  const [pregunta, setPregunta] = useState("");
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [msgs]);

  const preguntar = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { rol: "u", texto: q }, { rol: "a", texto: SIN_CONEXION }]);
  };
  const enviar = () => {
    const q = pregunta;
    setPregunta("");
    preguntar(q);
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
          <div className="msgs" ref={lista} aria-live="polite">
            {msgs.map((m, i) =>
              m.rol === "u" ? (
                <div key={i} className="msg u">
                  {m.texto}
                </div>
              ) : (
                <div key={i} className="msg a">
                  <div className="who">Asesor · Cupón Corrido{m.ia ? " · Respuesta generada por IA" : ""}</div>
                  {/* md() escapa el texto antes de convertirlo */}
                  <div dangerouslySetInnerHTML={{ __html: md(m.texto) }} />
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
            <button type="button" className="btn primary" onClick={enviar}>
              Enviar
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3>Consultas rápidas</h3>
          <div className="prompts">
            {QUICK.map(([t, d, q]) => (
              <button key={t} type="button" onClick={() => preguntar(q)}>
                <b>{t}</b>
                <span>{d}</span>
              </button>
            ))}
          </div>
          <div className="notice" style={{ fontSize: 12 }}>
            <span>
              <b>Contexto que lee el asesor:</b> TPM {F.pct(snap.macro.tpm, 2)}, IPC {F.pct(mk.ipcLast.annual, 2)} (
              {mk.ipcLast.f.slice(0, 7)}), IBR al {F.date(mk.ibrLast.f)}, curva TES del{" "}
              {F.date(snap.datos.curveDate)} y {pfValorado.length} posiciones del portafolio.
            </span>
          </div>
          <div className="notice" style={{ fontSize: 12 }}>
            <span className="chip warn">
              <span className="dot" />
              IA
            </span>
            <span>Respuestas generadas por IA. Herramienta académica, no es asesoría financiera.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
